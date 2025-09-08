// app/usb3104-analog/[id]/page.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { useParams } from "next/navigation";

type AnalogState = {
  "Channel comment": string[];
  "Channel Voltage": number[];
};
type Snap = Snapshot<AnalogState>;

export default function Page() {
  const params = useParams<{ id: string }>();
  const pageId = String(params?.id ?? "2");
  const [title, setTitle] = useState("Mcculw USB3104 Analog");
  const [snap, setSnap] = useState<Snap | null>(null);

  // --- track latest rev to ignore stale SSE echoes ---
  const revRef = useRef(0);
  useEffect(() => {
    revRef.current = snap?.rev ?? 0;
  }, [snap?.rev]);

  // --- derived state (safe variable, not a hook) ---
  const state: AnalogState = snap?.state ?? {
    "Channel comment": [],
    "Channel Voltage": [],
  };
  const comments = state["Channel comment"];
  const volts = state["Channel Voltage"];

  // --- commit debounce ---
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- per-channel RPC debounce for voltage ---
  const rpcTimers = useRef<Record<number, ReturnType<typeof setTimeout> | undefined>>({});

  // --- local drafts for comments (avoid hooks-in-loops) ---
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [editingCommentIndex, setEditingCommentIndex] = useState<number | null>(null);

  // If a new rev arrives and you're not actively editing, clear drafts to reflect latest server state
  useEffect(() => {
    if (editingCommentIndex === null) setCommentDrafts({});
  }, [snap?.rev, editingCommentIndex]);

  // ---- first load ----
  useEffect(() => {
    (async () => {
      const m = await fetch(`/api/page/${pageId}/meta`, { cache: "no-store" }).then(r => r.json());
      if (m?.title) setTitle(m.title);
      const s = (await fetch(`/api/page/${pageId}/state`, { cache: "no-store" }).then(r => r.json())) as Snap;
      setSnap(s);
    })();
  }, [pageId]);

  // ---- SSE subscribe ----
  useEffect(() => {
    const es = new EventSource(`/api/page/${pageId}/events`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (typeof data?.rev === "number" && data?.state != null) {
          if (data.rev <= revRef.current) return; // ignore echoes
          setSnap({ rev: data.rev, state: data.state } as Snap);
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, [pageId]);

  // ---- Undo / Redo ----
  async function undo() {
    const r = await fetch(`/api/page/${pageId}/undo`, { method: "POST" });
    if (r.ok) setSnap((await r.json()) as Snap);
  }
  async function redo() {
    const r = await fetch(`/api/page/${pageId}/redo`, { method: "POST" });
    if (r.ok) setSnap((await r.json()) as Snap);
  }

  // ---- commit (debounced) ----
  function scheduleCommit(nextState: AnalogState) {
    if (!snap) return;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const baseRev = snap.rev;
    commitTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/page/${pageId}/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRev, nextState }),
      });
      if (r.ok) {
        setSnap((await r.json()) as Snap);
      } else if (r.status === 409) {
        // conflict: reload
        const s = await fetch(`/api/page/${pageId}/state`, { cache: "no-store" }).then(rr => rr.json());
        setSnap(s as Snap);
      }
    }, 150);
  }

  // ---- RPC: set analog output (per-channel debounce) ----
  function scheduleRpc(channel: number, voltage: number) {
    const timers = rpcTimers.current;
    if (timers[channel]) clearTimeout(timers[channel]);
    timers[channel] = setTimeout(async () => {
      try {
        await fetch(`/api/usb3104-analog/set`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel, voltage }),
        });
      } catch {
        // ignore
      }
    }, 120);
  }

  function updateRow(i: number, key: keyof AnalogState, v: string | number) {
    const next: AnalogState = structuredClone(state);
    if (key === "Channel comment") {
      next["Channel comment"][i] = String(v);
    } else {
      const num = clamp(Number(v));
      next["Channel Voltage"][i] = num;
      scheduleRpc(i, num); // send RPC too
    }
    scheduleCommit(next);
  }

  // ---- comment helpers (commit on Enter / blur) ----
  function focusComment(i: number) {
    setEditingCommentIndex(i);
    setCommentDrafts((prev) => {
      if (prev[i] !== undefined) return prev;
      return { ...prev, [i]: comments[i] ?? "" };
    });
  }
  function changeComment(i: number, val: string) {
    setCommentDrafts((prev) => ({ ...prev, [i]: val }));
  }
  function cancelComment(i: number) {
    setCommentDrafts((prev) => {
      const copy = { ...prev };
      delete copy[i];
      return copy;
    });
    setEditingCommentIndex((cur) => (cur === i ? null : cur));
  }
  function applyComment(i: number) {
    const draft = commentDrafts[i] ?? "";
    const cur = comments[i] ?? "";
    if (draft !== cur) {
      updateRow(i, "Channel comment", draft);
    }
    setEditingCommentIndex((curIdx) => (curIdx === i ? null : curIdx));
    // keep draft so the value doesn't flicker; it will be cleared on next rev if not editing
  }

  // ---- caret-aware voltage editing ----
  function getStepFromCaret(text: string, caret: number): number {
    const neg = text.trim().startsWith("-");
    const s = neg ? text.trim().slice(1) : text.trim();
    const dot = s.indexOf(".");
    const rel = Math.max(0, caret - (neg ? 1 : 0));

    if (!/^\d*\.?\d*$/.test(s.replace(/,/g, ""))) return 0.001;

    if (dot === -1) {
      const i = Math.min(rel, s.length - 1);
      const k = s.length - 1 - i;
      return Math.max(0.001, Math.pow(10, k));
    }

    let i = Math.min(rel, s.length);
    if (i === dot) i -= 1;
    if (i < 0) return 0.001;
    if (i > dot) {
      const d = i - dot;
      return Math.max(0.001, Math.pow(10, -d));
    } else {
      const k = dot - 1 - i;
      return Math.max(0.001, Math.pow(10, k));
    }
  }

  function clamp(v: number) {
    if (!Number.isFinite(v)) return 0;
    if (v > 10) return 10;
    if (v < -10) return -10;
    return Math.round(v * 1000) / 1000;
  }

  const caretRef = useRef<Record<number, number>>({});

  function handleArrow(i: number, e: React.KeyboardEvent<HTMLInputElement>, dir: 1 | -1) {
    const el = e.currentTarget;
    const caret = el.selectionStart ?? String(el.value).length;
    const step = getStepFromCaret(el.value, caret);
    const raw = Number(el.value || 0);
    const next = clamp(raw + dir * step);

    e.preventDefault();
    caretRef.current[i] = caret;
    updateRow(i, "Channel Voltage", next);
  }

  // stable key to restore caret after voltage update
  const voltsKey = volts.map((v) => (Number.isFinite(v) ? v.toFixed(3) : "NaN")).join(",");
  useEffect(() => {
    const m = caretRef.current;
    if (!m || Object.keys(m).length === 0) return;
    requestAnimationFrame(() => {
      for (const [idxStr, pos] of Object.entries(m)) {
        const idx = Number(idxStr);
        const input = document.getElementById(`volt-${idx}`) as HTMLInputElement | null;
        if (input && typeof pos === "number") input.setSelectionRange(pos, pos);
      }
      caretRef.current = {};
    });
  }, [voltsKey]);

  if (!snap) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto max-w-5xl p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-72 rounded-lg bg-slate-200" />
            <div className="h-24 w-full rounded-2xl bg-slate-100" />
            <div className="h-96 w-full rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-5xl p-6 lg:p-8 space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">
              方向鍵 ↑/↓ 會依游標所在位數加減，範圍 -10 ~ 10，最小刻度 0.001。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ← Undo
            </button>
            <button
              onClick={redo}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Redo →
            </button>
            <span className="text-xs text-slate-500">
              rev <span className="font-mono">{snap.rev}</span>
            </span>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur">
          <div className="max-h-[70vh] overflow-auto rounded-2xl">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 w-16 text-left">#</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left">Channel comment</th>
                  <th className="border-b border-slate-200 px-3 py-2 w-40 text-left">Channel Voltage</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(comments.length, volts.length, 8) }).map((_, i) => {
                  const commentValue = (commentDrafts[i] ?? comments[i] ?? "");
                  return (
                    <tr key={i} className="transition-colors odd:bg-white even:bg-slate-50/60 hover:bg-emerald-50/40">
                      <td className="border-b border-slate-100 px-3 py-2">{i + 1}</td>

                      {/* Channel comment (commit on Enter/blur) */}
                      <td className="border-b border-slate-100 px-3 py-2">
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          value={commentValue}
                          onFocus={() => focusComment(i)}
                          onChange={(e) => changeComment(i, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              applyComment(i);
                              (e.currentTarget as HTMLInputElement).blur();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelComment(i);
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          onBlur={() => applyComment(i)}
                          placeholder="說明文字…"
                        />
                      </td>

                      {/* Channel Voltage */}
                      <td className="border-b border-slate-100 px-3 py-2">
                        <input
                          id={`volt-${i}`}
                          type="text"
                          inputMode="decimal"
                          className="w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 font-mono"
                          value={Number.isFinite(volts[i]) ? clamp(volts[i]).toFixed(3) : "0.000"}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d\.\-]/g, "");
                            const num = clamp(Number(raw));
                            caretRef.current[i] = e.target.selectionStart ?? raw.length;
                            updateRow(i, "Channel Voltage", num);
                          }}
                          onBlur={(e) => {
                            const num = clamp(Number(e.target.value || 0));
                            updateRow(i, "Channel Voltage", num);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") return handleArrow(i, e, +1);
                            if (e.key === "ArrowDown") return handleArrow(i, e, -1);
                          }}
                          placeholder="0.000"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            * 變更後 ~150ms 內無其他輸入才會送出，電壓同時以個別提交打 RPC 。
          </div>
        </section>
      </div>
    </div>
  );
}
