// app/wavemeter/[id]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot, Json } from "@/lib/types";
import { useParams } from "next/navigation";

type WavemeterState = {
  "Lightwave Link"?: { name: string[] };
  HighFinesse?: { State: number[]; Sensor: number[] | number[][] };
  "repetition time"?: number;
};
type Snap = Snapshot<WavemeterState>;

export default function Page() {
  const params = useParams<{ id: string }>();
  const pageId = String(params?.id ?? "1");
  const [pageTitle, setPageTitle] = useState("Wavelength meter");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [running, setRunning] = useState(false);
  const [rev, setRev] = useState(0);

  const revRef = useRef(0);
  useEffect(() => {
    revRef.current = rev;
  }, [rev]);

  // 讓 debounce timer 在 re-render 間不會遺失
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 首次載入 meta + state
  useEffect(() => {
    (async () => {
      const m = await fetch(`/api/page/${pageId}/meta`, { cache: "no-store" }).then((r) => r.json());
      if (m?.title) setPageTitle(m.title);
      const s = (await fetch(`/api/page/${pageId}/state`, { cache: "no-store" }).then((r) => r.json())) as Snap;
      setSnap(s);
      setRev(s?.rev ?? 0);
    })();
  }, [pageId]);

  const state: WavemeterState = snap?.state ?? {};

  const labels: string[] = state["Lightwave Link"]?.name ?? new Array(16).fill("");
  const enabled: number[] = state.HighFinesse?.State ?? new Array(16).fill(0);
  const sensorRaw = state.HighFinesse?.Sensor;
  const s1: number[] = Array.isArray(sensorRaw?.[0])
    ? (sensorRaw?.[0] as number[]) ?? new Array(16).fill(1)
    : (sensorRaw as number[]) ?? new Array(16).fill(1);

  const repetition = Number(state["repetition time"] ?? 1);

  // 訂閱 SSE（忽略舊版次）
  useEffect(() => {
    const es = new EventSource(`/api/page/${pageId}/events`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.state != null && typeof data?.rev === "number") {
          if (data.rev <= revRef.current) return; // 忽略自己剛寫入的 echo
          setSnap({ rev: data.rev, state: data.state } as Snap);
          setRev(data.rev);
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, [pageId]);

  // Runner 狀態
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/wavemeter/monitor/state`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          setRunning(Boolean(j?.running));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Debounce commit
  function scheduleCommit(nextState: WavemeterState) {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/page/${pageId}/mutate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseRev: rev, nextState }),
        });
        if (r.ok) {
          const j = (await r.json()) as Snap;
          setSnap(j);
          setRev(j.rev);
        } else if (r.status === 409) {
          // 版本衝突，重拉
          const rr = await fetch(`/api/page/${pageId}/state`, { cache: "no-store" });
          const jj = (await rr.json()) as Snap;
          setSnap(jj);
          setRev(jj.rev ?? 0);
        }
      } catch {
        // ignore
      }
    }, 250);
  }

  // 巢狀設定工具
  function setAt(root: unknown, path: (string | number)[], value: Json): void {
    if (!path.length) return;
    let cur: unknown = root;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const nextKey = path[i + 1];
      if (typeof key === "number") {
        if (!Array.isArray(cur)) return;
        const arr = cur as unknown[];
        if (typeof arr[key] !== "object" || arr[key] === null) {
          arr[key] = typeof nextKey === "number" ? [] : {};
        }
        cur = arr[key];
      } else {
        if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return;
        const obj = cur as Record<string, unknown>;
        if (typeof obj[key] !== "object" || obj[key] === null) {
          obj[key] = typeof nextKey === "number" ? [] : {};
        }
        cur = obj[key];
      }
    }
    const last = path[path.length - 1];
    if (typeof last === "number") {
      if (!Array.isArray(cur)) return;
      (cur as unknown[])[last] = value as unknown;
    } else {
      if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return;
      (cur as Record<string, unknown>)[last] = value as unknown;
    }
  }

  function updateAt(path: (string | number)[], value: Json) {
    const next: WavemeterState = structuredClone(state);
    setAt(next, path, value);
    scheduleCommit(next);
  }

  async function undo() {
    const r = await fetch(`/api/page/${pageId}/undo`, { method: "POST" });
    if (r.ok) {
      const j = (await r.json()) as Snap;
      setSnap(j);
      setRev(j.rev);
    }
  }
  async function redo() {
    const r = await fetch(`/api/page/${pageId}/redo`, { method: "POST" });
    if (r.ok) {
      const j = (await r.json()) as Snap;
      setSnap(j);
      setRev(j.rev);
    }
  }

  async function onStart() {
    const r = await fetch(`/api/wavemeter/monitor/start`, { method: "POST" });
    if (r.ok) setRunning(true);
  }
  async function onStop() {
    const r = await fetch(`/api/wavemeter/monitor/stop`, { method: "POST" });
    if (r.ok) setRunning(false);
  }
  async function onCalibrate() {
    await fetch(`/api/wavemeter/calibrate`, { method: "POST" }).catch(() => {});
  }

  // ===== Label「本地草稿 + Enter / Blur 提交」=====
  // 用 object 存每個 idx 的暫存字串；有值表示正在編輯
  const [labelDrafts, setLabelDrafts] = useState<Record<number, string>>({});

  // 封裝：把某列草稿（若存在）提交到狀態，然後清草稿
  function commitLabelIfNeeded(idx: number) {
    setLabelDrafts((prev) => {
      const hasDraft = Object.prototype.hasOwnProperty.call(prev, idx);
      if (!hasDraft) return prev;
      const draft = prev[idx];
      // 僅在與目前 state 不同時才提交，避免多餘寫入
      if (draft !== (labels[idx] ?? "")) {
        updateAt(["Lightwave Link", "name", idx], draft);
      }
      // 清除該 idx 的草稿
      const { [idx]: _omit, ...rest } = prev;
      return rest;
    });
  }

  if (!snap) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto max-w-6xl p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 rounded-lg bg-slate-200" />
            <div className="h-24 w-full rounded-2xl bg-slate-100" />
            <div className="h-96 w-full rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
              {pageTitle}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                  running
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-50 text-slate-600 ring-slate-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    running ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                  }`}
                />
                {running ? "Running" : "Stopped"}
              </span>
              <span className="text-xs text-slate-500">
                rev <span className="font-mono">{rev}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Undo
            </button>
            <button
              onClick={redo}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Redo
            </button>
            <button
              onClick={onCalibrate}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Calibrate
            </button>
            {!running ? (
              <button
                onClick={onStart}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                ▶ Run
              </button>
            ) : (
              <button
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                ■ Stop
              </button>
            )}
          </div>
        </header>

        {/* Controls */}
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
          <label className="block text-sm font-medium text-slate-700">
            Repetition time (s)
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              min={0}
              className="w-40 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={isFinite(repetition) ? repetition : 0}
              onChange={(e) => updateAt(["repetition time"], Number(e.target.value))}
            />
            <span className="text-xs text-slate-500">
              每個 channel 完成一次（設切換 DAQ）後的等待秒數。
            </span>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur">
          <div className="max-h-[70vh] overflow-auto rounded-2xl">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur">
                <tr className="text-left text-slate-700">
                  <th className="border-b border-slate-200 px-3 py-2 w-16">#</th>
                  <th className="border-b border-slate-200 px-3 py-2">Label</th>
                  <th className="border-b border-slate-200 px-3 py-2 w-28">Enabled</th>
                  <th className="border-b border-slate-200 px-3 py-2 w-40">Sensor 1 (ms)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 16 }).map((_, idx) => {
                  const labelFromState = labels[idx] ?? "";
                  const labelValue = Object.prototype.hasOwnProperty.call(labelDrafts, idx)
                    ? labelDrafts[idx]
                    : labelFromState;
                  const on = Number(enabled[idx] ?? 0) === 1;
                  const v1 = s1[idx] ?? 1;

                  return (
                    <tr
                      key={idx}
                      className={`transition-colors odd:bg-white even:bg-slate-50/60 hover:bg-emerald-50/40 ${on ? "" : "opacity-60"}`}
                    >
                      <td className="border-b border-slate-100 px-3 py-2">{idx + 1}</td>

                      {/* Label（本地草稿 + Enter/Blur 提交） */}
                      <td className="border-b border-slate-100 px-3 py-2">
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          value={labelValue}
                          onChange={(e) =>
                            setLabelDrafts((prev) => ({ ...prev, [idx]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitLabelIfNeeded(idx);
                              // 可選：移動焦點，模擬提交
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          onBlur={() => commitLabelIfNeeded(idx)}
                          placeholder="Channel label…"
                        />
                      </td>

                      {/* Enabled */}
                      <td className="border-b border-slate-100 px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            checked={on}
                            onChange={(e) =>
                              updateAt(["HighFinesse", "State", idx], e.target.checked ? 1 : 0)
                            }
                          />
                          <span className="text-slate-700">On</span>
                        </label>
                      </td>

                      {/* Sensor 1 */}
                      <td className="border-b border-slate-100 px-3 py-2">
                        <input
                          type="number"
                          step={1}
                          min={0}
                          className="w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          value={Number.isFinite(v1) ? Math.max(0, Math.floor(v1)) : 0}
                          onChange={(e) => {
                            const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            updateAt(["HighFinesse", "Sensor", idx], v);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 p-3 text-xs text-slate-500">
            * Sensor 1 單位毫秒（ms），執行時會除以 1000 轉成秒傳給硬體層。Label 欄位改為 Enter / 失焦時才提交，避免輸入時被 SSE 重繪打斷。
          </div>
        </section>
      </div>
    </div>
  );
}
