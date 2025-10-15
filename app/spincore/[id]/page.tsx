// app/spincore/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, ReactNode, useLayoutEffect } from "react";
import type { Snapshot, Json } from "@/lib/types";
import { useParams } from "next/navigation";

type Timing = {
  label: string;
  "sequence type": string;
  "sequence times": number;
  "time range": number;
  "time scale": string;
  sequence: number[]; // 24 x 0/1
};
type Sequence = { name: string; comment: string; timing: Timing[] };
type SpinCoreState = {
  "Initial pagination": number;
  "time scale": string[];
  "sequence type": string[];
  "Channel name": string[];
  Sequence: Sequence[];
};
type Snap = Snapshot<SpinCoreState>;

const CHANNELS = 24;

const NEW_SEQUENCE: Sequence = {
  name: "new seq",
  comment: "None",
  timing: [
    {
      label: "",
      "time range": 1,
      "time scale": "ms",
      "sequence type": "WAIT",
      "sequence times": 0,
      sequence: Array(CHANNELS).fill(0),
    },
    {
      label: "",
      "time range": 1,
      "time scale": "ms",
      "sequence type": "CONTINUE",
      "sequence times": 0,
      sequence: Array(CHANNELS).fill(1),
    },
    {
      label: "",
      "time range": 1,
      "time scale": "ms",
      "sequence type": "BRANCH",
      "sequence times": 0,
      sequence: Array(CHANNELS).fill(0),
    },
  ],
};
const NEW_TIMING: Timing = {
  label: "",
  "time range": 1,
  "time scale": "us",
  "sequence type": "CONTINUE",
  "sequence times": 0,
  sequence: Array(CHANNELS).fill(0),
};

// --- Icons ---
function IconTrash({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2L18 7" />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M10 11v6M14 11v6" />
    </svg>
  );
}
function IconSwap({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M7 7h10M17 7l-2-2m2 2-2 2M17 17H7m0 0 2-2m-2 2 2 2" />
    </svg>
  );
}
function IconCopyPlus({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M14 12v6M11 15h6" />
    </svg>
  );
}

export default function SpinCorePage() {
  const params = useParams<{ id: string }>();
  const pageId = String(params?.id ?? "3");
  const [title, setTitle] = useState("SpinCore");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [rev, setRev] = useState(0);

  const state: SpinCoreState = snap?.state ?? {
    "Initial pagination": 0,
    "time scale": ["s", "ms", "us", "ns"],
    "sequence type": ["WAIT", "CONTINUE", "BRANCH", "LOOP", "END_LOOP"],
    "Channel name": Array(CHANNELS).fill(""),
    Sequence: [],
  };

  const [seqIndex, setSeqIndex] = useState<number>(state["Initial pagination"] ?? 0);
  const [seqCollapsed, setSeqCollapsed] = useState(false);

  // --- initial load ---
  useEffect(() => {
    (async () => {
      const m = await fetch(`/api/page/${pageId}/meta`, { cache: "no-store" }).then((r) => r.json());
      if (m?.title) setTitle(m.title);
      const s = (await fetch(`/api/page/${pageId}/state`, { cache: "no-store" }).then((r) => r.json())) as Snap;
      setSnap(s);
      setRev(s?.rev ?? 0);
      setSeqIndex(Number(s?.state?.["Initial pagination"] ?? 0) || 0);
    })();
  }, [pageId]);

  // --- SSE ---
  const revRef = useRef(0);
  useEffect(() => { revRef.current = rev; }, [rev]);

  useEffect(() => {
    const es = new EventSource(`/api/page/${pageId}/events`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.state && typeof data?.rev === "number") {
          if (data.rev <= revRef.current) return;
          setSnap({ rev: data.rev, state: data.state } as Snap);
          setRev(data.rev);
          setSeqIndex(Number(data.state?.["Initial pagination"] ?? 0) || 0);
        }
      } catch { }
    };
    return () => es.close();
  }, [pageId]);

  // --- commit (debounce) ---
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleCommit(nextState: SpinCoreState) {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    const base = rev;
    commitTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/page/${pageId}/mutate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseRev: base, nextState }),
        });
        if (r.ok) {
          const j = (await r.json()) as Snap;
          setSnap(j);
          setRev(j.rev);
        } else if (r.status === 409) {
          const rr = await fetch(`/api/page/${pageId}/state`, { cache: "no-store" });
          const jj = (await rr.json()) as Snap;
          setSnap(jj);
          setRev(jj.rev ?? 0);
        }
      } catch { }
    }, 180);
  }

  // --- nested update helper ---
  function setAt(root: unknown, path: (string | number)[], value: Json): void {
    if (!path.length) return;
    let cur: unknown = root;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const nextKey = path[i + 1];
      if (typeof key === "number") {
        if (!Array.isArray(cur)) return;
        const arr = cur as unknown[];
        if (typeof (arr as any)[key] !== "object" || (arr as any)[key] === null) {
          (arr as any)[key] = typeof nextKey === "number" ? [] : {};
        }
        cur = (arr as any)[key];
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
    const next: SpinCoreState = structuredClone(state);
    setAt(next, path, value);
    scheduleCommit(next);
  }

  // --- Undo / Redo / Run ---
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
  async function runCurrent() {
    const r = await fetch(`/api/spincore/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seqIndex }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) alert(`Run failed: ${j?.error ?? r.statusText}`);
    else alert("Run sent!");
  }

  // --- Sequence ops ---
  const seqList = state.Sequence ?? [];
  const curSeq = useMemo<Sequence | null>(() => seqList[seqIndex] ?? null, [seqList, seqIndex]);

  function onPickSequence(idx: number) {
    setSeqIndex(idx);
    updateAt(["Initial pagination"], idx);
  }
  function setSeqField<K extends keyof Sequence>(k: K, v: Sequence[K]) {
    const next = structuredClone(state);
    next.Sequence[seqIndex][k] = v;
    scheduleCommit(next);
  }
  function addSequence() {
    const next = structuredClone(state);
    next.Sequence = [...seqList, structuredClone(NEW_SEQUENCE)];
    scheduleCommit(next);
  }
  function deleteSequence(idx: number) {
    if (!confirm(`Delete sequence #${idx + 1}?`)) return;
    const next = structuredClone(state);
    next.Sequence.splice(idx, 1);
    const newIdx = Math.max(0, Math.min(next.Sequence.length - 1, idx));
    next["Initial pagination"] = newIdx;
    setSeqIndex(newIdx);
    scheduleCommit(next);
  }
  function moveSequence(from: number, to: number) {
    if (from === to || to < 0 || to >= seqList.length) return;
    const next = structuredClone(state);
    const item = next.Sequence.splice(from, 1)[0];
    next.Sequence.splice(to, 0, item);
    let newIdx = seqIndex;
    if (seqIndex === from) newIdx = to;
    else if (from < seqIndex && to >= seqIndex) newIdx = seqIndex - 1;
    else if (from > seqIndex && to <= seqIndex) newIdx = seqIndex + 1;
    next["Initial pagination"] = newIdx;
    setSeqIndex(newIdx);
    scheduleCommit(next);
  }
  function importSequence(into: number, from: number) {
    if (!confirm(`Replace sequence #${into + 1} with a copy of #${from + 1}?`)) return;
    const next = structuredClone(state);
    next.Sequence[into] = structuredClone(seqList[from]);
    scheduleCommit(next);
  }
  function replaceSequenceDirect(into: number, from: number) {
    const next = structuredClone(state);
    next.Sequence[into] = structuredClone(seqList[from]);
    scheduleCommit(next);
  }

  // --- Timing ops ---
  const timing = curSeq?.timing ?? [];
  const typeOptions = state["sequence type"] ?? ["WAIT", "CONTINUE", "BRANCH", "LOOP", "END_LOOP"];
  const scaleOptions = state["time scale"] ?? ["s", "ms", "us", "ns"];
  const channelNames = state["Channel name"] ?? Array(CHANNELS).fill("");

  function setTimingField(i: number, k: keyof Timing, v: Timing[keyof Timing]) {
    snapshotTimingScroll();
    const next = structuredClone(state);
    (next.Sequence[seqIndex].timing[i] as any)[k] = v as never;
    scheduleCommit(next);
  }
  function toggleBit(i: number, bit: number) {
    snapshotTimingScroll();
    const next = structuredClone(state);
    const cur = next.Sequence[seqIndex].timing[i].sequence[bit] ?? 0;
    next.Sequence[seqIndex].timing[i].sequence[bit] = cur ? 0 : 1;
    scheduleCommit(next);
  }
  function addTiming(at?: number) {
    snapshotTimingScroll();
    const next = structuredClone(state);
    const arr = next.Sequence[seqIndex].timing;
    const pos = typeof at === "number" ? Math.max(0, Math.min(arr.length, at)) : arr.length;
    arr.splice(pos, 0, structuredClone(NEW_TIMING));
    scheduleCommit(next);
  }
  function deleteTiming(i: number) {
    if (!confirm(`Delete timing #${i + 1}?`)) return;
    snapshotTimingScroll();
    const next = structuredClone(state);
    next.Sequence[seqIndex].timing.splice(i, 1);
    scheduleCommit(next);
  }
  function moveTiming(from: number, to: number) {
    if (from === to || to < 0 || to >= timing.length) return;
    snapshotTimingScroll();
    const next = structuredClone(state);
    const arr = next.Sequence[seqIndex].timing;
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    scheduleCommit(next);
  }
  function importTiming(into: number, from: number) {
    snapshotTimingScroll();
    const next = structuredClone(state);
    next.Sequence[seqIndex].timing[into] = structuredClone(timing[from]);
    scheduleCommit(next);
  }
  function insertTimingCopy(src: number, at: number) {
    snapshotTimingScroll();
    const next = structuredClone(state);
    next.Sequence[seqIndex].timing.splice(at, 0, structuredClone(timing[src]));
    scheduleCommit(next);
  }

  // --- visual / preview states ---
  const [hoverSeqDelete, setHoverSeqDelete] = useState<number | null>(null);
  const [hoverTimingDelete, setHoverTimingDelete] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ i: number; mode: "replace" | "insert" } | null>(null);
  const [menuHoverSrc, setMenuHoverSrc] = useState<number | null>(null);
  const [menuSelectedSrc, setMenuSelectedSrc] = useState<number | null>(null);
  const dragTimingFrom = useRef<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);

  // Sequences Import
  const [seqImportOpen, setSeqImportOpen] = useState<number | null>(null);
  const [seqImportHoverFrom, setSeqImportHoverFrom] = useState<number | null>(null);
  const [seqImportSelectedFrom, setSeqImportSelectedFrom] = useState<number | null>(null);

  const seqImportPreviewIdx =
    seqImportOpen !== null && seqImportOpen === seqIndex
      ? (seqImportHoverFrom ?? seqImportSelectedFrom)
      : null;

  const seqImportPreviewFrom =
    typeof seqImportPreviewIdx === "number"
      ? (seqList[seqImportPreviewIdx] ?? null)
      : null;

  const usingSeqImportPreview = seqImportPreviewFrom != null;

  const effectiveTiming: Timing[] = usingSeqImportPreview
    ? (seqImportPreviewFrom!.timing ?? [])
    : timing;

  // Timing scroll container & snapshot to avoid jumping to top
  const timingScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollSnapshotRef = useRef<{ left: number; top: number } | null>(null);

  function snapshotTimingScroll() {
    const sc = timingScrollRef.current;
    if (sc) scrollSnapshotRef.current = { left: sc.scrollLeft, top: sc.scrollTop };
  }
  useLayoutEffect(() => {
    if (scrollSnapshotRef.current) {
      const sc = timingScrollRef.current;
      if (sc) sc.scrollTo({
        left: scrollSnapshotRef.current.left,
        top: scrollSnapshotRef.current.top,
      });
      scrollSnapshotRef.current = null;
    }
  }, [menu, snap]);

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

  // --- Timing Card (with local edit buffers to keep focus) ---
  function TimingCard(props: {
    t: Timing;
    i: number;
    realIndex: number | null;
    draggable?: boolean;
    isDragOver?: boolean;
    muted?: boolean;
    ghost?: boolean;
    diffWith?: Timing | null;
    redBase?: boolean;
    onDragStart?: () => void;
    onDragOver?: () => void;
    onDragLeave?: () => void;
    onDrop?: () => void;
    onOpenInsert?: () => void;
    onOpenReplace?: () => void;
    onDeleteHoverStart?: () => void;
    onDeleteHoverEnd?: () => void;
    onDelete?: () => void;

    // inline panel
    menuOpenMode?: "replace" | "insert" | null;
    menuHoverSrc?: number | null;
    menuSelectedSrc?: number | null;
    onMenuHover?: (j: number) => void;
    onMenuSelect?: (j: number) => void;
    onMenuCancel?: () => void;
    onMenuApply?: () => void;
    optionsCount?: number;
  }) {
    const {
      t, i, realIndex, draggable, isDragOver, muted, ghost, diffWith, redBase,
      onDragStart, onDragOver, onDragLeave, onDrop,
      onOpenInsert, onOpenReplace, onDeleteHoverStart, onDeleteHoverEnd, onDelete,
      menuOpenMode, menuHoverSrc, menuSelectedSrc, onMenuHover, onMenuSelect, onMenuCancel, onMenuApply, optionsCount,
    } = props;

    // diff compute for replace preview
    const isChangedField = (k: keyof Timing) =>
      diffWith ? String(t[k] ?? "") !== String(diffWith[k] ?? "") : false;

    const changedBits = useMemo(() => {
      if (!diffWith) return new Set<number>();
      const set = new Set<number>();
      for (let b = 0; b < CHANNELS; b++) {
        const a = t.sequence[b] ?? 0;
        const bval = diffWith.sequence[b] ?? 0;
        if (Number(a) !== Number(bval)) set.add(b);
      }
      return set;
    }, [diffWith, t]);

    // --- local edit buffers (fix: keep focus while typing) ---
    const [labelEditing, setLabelEditing] = useState(false);
    const [labelBuf, setLabelBuf] = useState(t.label);
    useEffect(() => { if (!labelEditing) setLabelBuf(t.label); }, [t.label, labelEditing]);

    const [trEditing, setTrEditing] = useState(false);
    const [trBuf, setTrBuf] = useState<number>(t["time range"]);
    useEffect(() => { if (!trEditing) setTrBuf(t["time range"]); }, [t["time range"], trEditing]);

    const [timesEditing, setTimesEditing] = useState(false);
    const [timesBuf, setTimesBuf] = useState<number>(t["sequence times"]);
    useEffect(() => { if (!timesEditing) setTimesBuf(t["sequence times"]); }, [t["sequence times"], timesEditing]);

    function commitLabel() {
      if (realIndex === null) return;
      if (labelBuf !== t.label) setTimingField(realIndex, "label", labelBuf);
    }
    function commitTimeRange() {
      if (realIndex === null) return;
      const v = Number.isFinite(trBuf) ? trBuf : 0;
      if (v !== t["time range"]) setTimingField(realIndex, "time range", v);
    }
    function commitTimes() {
      if (realIndex === null) return;
      const v = Math.max(0, Math.floor(Number(timesBuf) || 0));
      if (v !== t["sequence times"]) setTimingField(realIndex, "sequence times", v);
    }

    return (
      <div
        className={[
          "relative rounded-xl border flex-none",
          isDragOver ? "border-emerald-400" : "border-slate-200",
          muted ? "opacity-60 pointer-events-none" : "",
          ghost ? "ring-2 ring-emerald-400 border-emerald-300 bg-emerald-50/60" : "bg-white",
          redBase ? "bg-rose-50 ring-1 ring-rose-300" : "",
        ].join(" ")}
        style={{ minWidth: 100, maxWidth: 150 }}
        onDragStart={(e) => {
          if (!draggable || realIndex == null) return;
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragOver={(e) => { if (draggable) { e.preventDefault(); onDragOver?.(); } }}
        onDragLeave={() => onDragLeave?.()}
        onDrop={() => onDrop?.()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/80 p-2">
          <div className="mb-2 flex items-center justify-between">
            <div
              className="text-xs text-slate-600 select-none cursor-grab"
              draggable={!!draggable}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                onDragStart?.();
              }}
            >
              {ghost ? "#?" : `#${i + 1}`}
            </div>
            {!ghost && realIndex !== null && !muted && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Insert copy"
                  title="Insert copy…"
                  className="rounded-md border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-50"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenInsert?.(); }}
                >
                  <IconCopyPlus />
                </button>

                <button
                  type="button"
                  aria-label="Replace from"
                  title="Replace from…"
                  className="rounded-md border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-50"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenReplace?.(); }}
                >
                  <IconSwap />
                </button>

                <button
                  type="button"
                  aria-label="Delete timing"
                  title="Delete"
                  className="rounded-md border border-rose-300 bg-rose-50 p-1 text-rose-700 hover:bg-rose-100"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onMouseEnter={() => onDeleteHoverStart?.()}
                  onMouseLeave={() => onDeleteHoverEnd?.()}
                  onClick={() => onDelete?.()}
                >
                  <IconTrash />
                </button>
              </div>
            )}
          </div>

          {/* Form */}
          <input
            className={[
              "w-full rounded border bg-white px-1 py-0.5 text-xs",
              isChangedField("label") ? "border-rose-300 bg-rose-50" : "border-slate-300",
              ghost ? "pointer-events-none bg-emerald-50/60" : "",
            ].join(" ")}
            value={labelEditing ? labelBuf : t.label}
            onFocus={() => { setLabelEditing(true); setLabelBuf(t.label); }}
            onChange={(e) => setLabelBuf(e.target.value)}
            onBlur={() => { setLabelEditing(false); commitLabel(); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder={ghost ? "Insert preview" : "Label…"}
            disabled={ghost}
          />

          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              max={1000}
              step="any"
              className={[
                "rounded border bg-white px-1 py-0.5 text-xs",
                isChangedField("time range") ? "border-rose-300 bg-rose-50" : "border-slate-300",
                ghost ? "pointer-events-none bg-emerald-50/60" : "",
              ].join(" ")}
              value={trEditing ? trBuf : t["time range"]}
              onFocus={() => { setTrEditing(true); setTrBuf(t["time range"]); }}
              onChange={(e) => setTrBuf(Number(e.target.value))}
              onBlur={() => { setTrEditing(false); commitTimeRange(); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              title="Time range"
              disabled={ghost}
            />

            <select
              className={[
                "rounded border bg-white px-1 py-0.5 text-xs",
                isChangedField("time scale") ? "border-rose-300 bg-rose-50" : "border-slate-300",
                ghost ? "pointer-events-none bg-emerald-50/60" : "",
              ].join(" ")}
              value={t["time scale"]}
              onChange={(e) => realIndex !== null && setTimingField(realIndex, "time scale", e.target.value)}
              title="Time scale"
              disabled={ghost}
            >
              {scaleOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>

            <select
              className={[
                "rounded border bg-white px-1 py-0.5 text-[9px]",
                isChangedField("sequence type") ? "border-rose-300 bg-rose-50" : "border-slate-300",
                ghost ? "pointer-events-none bg-emerald-50/60" : "",
              ].join(" ")}
              value={t["sequence type"]}
              onChange={(e) => realIndex !== null && setTimingField(realIndex, "sequence type", e.target.value)}
              title="Sequence type"
              disabled={ghost}
            >
              {typeOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>

            <input
              type="number"
              min={0}
              step={1}
              className={[
                "rounded border bg-white px-1 py-0.5 text-xs",
                isChangedField("sequence times") ? "border-rose-300 bg-rose-50" : "border-slate-300",
                ghost ? "pointer-events-none bg-emerald-50/60" : "",
              ].join(" ")}
              value={timesEditing ? timesBuf : t["sequence times"]}
              onFocus={() => { setTimesEditing(true); setTimesBuf(t["sequence times"]); }}
              onChange={(e) => setTimesBuf(Number(e.target.value))}
              onBlur={() => { setTimesEditing(false); commitTimes(); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              title="Sequence times"
              disabled={ghost}
            />
          </div>
        </div>

        {/* 24-bit check row */}
        <div className="p-2">
          <ul>
            {Array.from({ length: CHANNELS }).map((_, bit) => {
              const changed = changedBits.has(bit);
              return (
                <li
                  key={bit}
                  className={[
                    "border-b py-1 last:border-b-0 flex justify-center",
                    changed ? "bg-rose-50 border-rose-100" : "border-slate-100",
                  ].join(" ")}
                >
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <span className="shrink-0 text-[11px] text-slate-500 text-right tabular-nums">
                      #{bit.toString().padStart(2, "0")}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      checked={Boolean(t.sequence[bit] ?? 0)}
                      onChange={() => realIndex !== null && toggleBit(realIndex, bit)}
                      title={`bit #${bit}`}
                      disabled={ghost}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Inline menu */}
        {menuOpenMode && (
          <div className="absolute right-2 top-8 z-30 w-35 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            <div className="mb-2 text-xs font-medium text-slate-600">
              {menuOpenMode === "replace" ? "Replace from" : "Insert copy of"}
            </div>
            <ul className="max-h-48 overflow-auto mb-2">
              {Array.from({ length: optionsCount ?? 0 }).map((_, j) => (
                <li
                  key={j}
                  className={[
                    "cursor-pointer rounded px-2 py-1 text-sm",
                    menuHoverSrc === j ? "bg-slate-100" : "",
                    menuSelectedSrc === j ? "ring-1 ring-emerald-300 bg-emerald-50" : "",
                  ].join(" ")}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onMouseEnter={() => onMenuHover?.(j)}
                  onClick={() => onMenuSelect?.(j)}
                >
                  #{j + 1}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-sm hover:bg-slate-50"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => onMenuCancel?.()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-emerald-600 px-2 py-0.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={typeof menuSelectedSrc !== "number"}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => onMenuApply?.()}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- render timing strip ---
  function renderTimingStrip() {
    const list: ReactNode[] = [];

    for (let i = 0; i < effectiveTiming.length; i++) {
      const t = effectiveTiming[i];
      const isMenuOpenHere = !usingSeqImportPreview && menu && menu.i === i;

      const previewIdx =
        (isMenuOpenHere)
          ? (menuHoverSrc ?? menuSelectedSrc)
          : null;

      const insertGhostShouldShow = !!(
        !usingSeqImportPreview &&
        menu &&
        menu.mode === "insert" &&
        menu.i === i &&
        (menuHoverSrc ?? menuSelectedSrc) !== null
      );

      const realIndex = usingSeqImportPreview ? null : i;

      list.push(
        <TimingCard
          key={`card-${i}`}
          t={t}
          i={i}
          realIndex={realIndex}
          draggable={!usingSeqImportPreview && !isMenuOpenHere}
          isDragOver={dragOverCol === i}
          muted={usingSeqImportPreview}
          redBase={hoverTimingDelete === i}
          diffWith={
            (!usingSeqImportPreview &&
              menu &&
              menu.mode === "replace" &&
              menu.i === i &&
              typeof previewIdx === "number")
              ? timing[previewIdx]
              : null
          }
          onDragStart={() => { dragTimingFrom.current = i; }}
          onDragOver={() => { setDragOverCol(i); }}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={() => {
            const from = dragTimingFrom.current;
            dragTimingFrom.current = null;
            setDragOverCol(null);
            if (typeof from === "number") moveTiming(from, i);
          }}
          onOpenInsert={() => {
            snapshotTimingScroll();
            setMenu({ i, mode: "insert" });
            setMenuHoverSrc(i);
            setMenuSelectedSrc(i);
          }}
          onOpenReplace={() => {
            snapshotTimingScroll();
            const init = Math.max(0, i - 1);
            setMenu({ i, mode: "replace" });
            setMenuHoverSrc(init);
            setMenuSelectedSrc(init);
          }}
          onDeleteHoverStart={() => setHoverTimingDelete(i)}
          onDeleteHoverEnd={() => setHoverTimingDelete(null)}
          onDelete={() => realIndex !== null && deleteTiming(realIndex)}

          menuOpenMode={isMenuOpenHere ? menu!.mode : null}
          menuHoverSrc={isMenuOpenHere ? menuHoverSrc : null}
          menuSelectedSrc={isMenuOpenHere ? menuSelectedSrc : null}
          onMenuHover={(j) => setMenuHoverSrc(j)}
          onMenuSelect={(j) => setMenuSelectedSrc(j)}
          onMenuCancel={() => {
            snapshotTimingScroll();
            setMenu(null);
            setMenuHoverSrc(null);
            setMenuSelectedSrc(null);
          }}
          onMenuApply={() => {
            snapshotTimingScroll();
            if (typeof menuSelectedSrc !== "number") return;
            if (menu!.mode === "replace") {
              importTiming(i, menuSelectedSrc);
            } else {
              insertTimingCopy(menuSelectedSrc, i + 1);
            }
            setMenu(null);
            setMenuHoverSrc(null);
            setMenuSelectedSrc(null);
          }}
          optionsCount={timing.length}
        />
      );

      if (insertGhostShouldShow) {
        const src = timing[(menuHoverSrc ?? menuSelectedSrc)!];
        list.push(
          <TimingCard
            key={`ghost-after-${i}`}
            t={src}
            i={i + 1}
            realIndex={null}
            draggable={false}
            ghost
          />
        );
      }
    }

    return list;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 lg:p-6">
      <div className="mx-auto w-full max-w-full space-y-4">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">Timing/Sequence drag & preview; stable inputs with local edit buffers; menus don’t jump to top.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undo} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">← Undo</button>
            <button onClick={redo} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Redo →</button>
            <button onClick={runCurrent} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">▶ Run</button>
            <span className="text-xs text-slate-500">rev <span className="font-mono">{rev}</span></span>
          </div>
        </header>

        <div className="grid grid-cols-78 gap-6">
          {/* Left: Sequences */}
          <section className={`col-span-15 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm relative ${seqCollapsed ? "hidden" : ""}`}>
            <button
              onClick={() => setSeqCollapsed(true)}
              className="absolute left-2 top-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              aria-label="Collapse sequences"
              title="Collapse"
            >
              ⟨
            </button>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium text-slate-800">Sequences</h2>
              <button onClick={addSequence} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm hover:bg-slate-50">+ Add</button>
            </div>

            <ul className="space-y-2">
              {(state.Sequence ?? []).map((s, i) => {
                const isActive = i === seqIndex;
                const hoverRed = hoverSeqDelete === i;
                return (
                  <li
                    key={i}
                    className={[
                      "rounded-lg border p-2 transition-colors",
                      isActive ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white/70",
                      hoverRed ? "bg-rose-50 ring-1 ring-rose-300" : "",
                      "relative",
                    ].join(" ")}
                  >
                    <label className="flex items-center gap-2">
                      <input type="radio" name="seq" checked={isActive} onChange={() => onPickSequence(i)} />
                      <input
                        className="w-full rounded border border-slate-200 bg-white/90 px-1 py-0.5 text-sm"
                        value={s.name}
                        onChange={(e) => { setSeqIndex(i); updateAt(["Initial pagination"], i); setSeqField("name", e.target.value); }}
                      />
                    </label>

                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <button
                        onClick={() => moveSequence(i, Math.max(0, i - 1))}
                        className="rounded border px-2 py-0.5 hover:bg-slate-50"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveSequence(i, Math.min((state.Sequence?.length ?? 1) - 1, i + 1))}
                        className="rounded border px-2 py-0.5 hover:bg-slate-50"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        onMouseEnter={() => setHoverSeqDelete(i)}
                        onMouseLeave={() => setHoverSeqDelete(null)}
                        onClick={() => deleteSequence(i)}
                        className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-rose-700 hover:bg-rose-100"
                        title="Delete"
                      >
                        Delete
                      </button>

                      <span className="ml-auto text-slate-500">Import</span>
                      <button
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
                        onClick={() => {
                          setSeqIndex(i);
                          setSeqImportOpen(i);
                          setSeqImportHoverFrom(null);
                          setSeqImportSelectedFrom(null);
                        }}
                        title="Import…"
                      >
                        …
                      </button>

                      {seqImportOpen === i && (
                        <div className="absolute right-2 top-10 z-30 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                          <div className="mb-2 text-xs font-medium text-slate-600">Replace with sequence…</div>
                          <ul className="max-h-48 overflow-auto">
                            {(state.Sequence ?? []).map((_, j) => (
                              j !== i && (
                                <li
                                  key={j}
                                  className={[
                                    "cursor-pointer rounded px-2 py-1 text-sm",
                                    seqImportHoverFrom === j ? "bg-slate-100" : "",
                                    seqImportSelectedFrom === j ? "ring-1 ring-emerald-300 bg-emerald-50" : "",
                                  ].join(" ")}
                                  onMouseEnter={() => setSeqImportHoverFrom(j)}
                                  onClick={() => setSeqImportSelectedFrom(j)}
                                >
                                  #{j + 1}
                                </li>
                              )
                            ))}
                          </ul>
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-sm hover:bg-slate-50"
                              onClick={() => { setSeqImportOpen(null); setSeqImportHoverFrom(null); setSeqImportSelectedFrom(null); }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="rounded-md bg-emerald-600 px-2 py-0.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                              disabled={seqImportSelectedFrom === null}
                              onClick={() => {
                                if (seqImportSelectedFrom !== null) {
                                  replaceSequenceDirect(i, seqImportSelectedFrom);
                                }
                                setSeqImportOpen(null);
                                setSeqImportHoverFrom(null);
                                setSeqImportSelectedFrom(null);
                              }}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {isActive && (
                      <div className="mt-2">
                        <label className="block text-xs text-slate-700">
                          Comment
                          <textarea
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-1 py-0.5"
                            rows={3}
                            value={curSeq?.comment ?? ""}
                            onChange={(e) => setSeqField("comment", e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Right: Timing + Channels */}
          <section className={`${seqCollapsed ? "col-span-78" : "col-span-63"} rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden relative`}>
            {seqCollapsed && (
              <button
                onClick={() => setSeqCollapsed(false)}
                className="absolute left-2 top-2 z-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                aria-label="Expand sequences"
                title="Expand"
              >
                ⟩
              </button>
            )}

            {usingSeqImportPreview && (
              <div className="absolute inset-x-0 top-0 z-20 bg-amber-50/90 px-4 py-2 text-xs text-amber-800 border-b border-amber-200">
                Preview: replace current sequence with <span className="font-mono">#{(seqImportPreviewIdx! + 1).toString()}</span>. View is semi-transparent until you click <span className="font-medium">Apply</span> in the left panel.
              </div>
            )}

            <div className="flex w-full h-100py">
              {/* Channels */}
              <div className="shrink-0 w-72 border-r border-slate-200 overflow-y-auto">
                <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 px-4 py-2 text-sm font-medium text-slate-700">
                  Channels
                </div>
                <div className="px-3">
                  {Array.from({ length: CHANNELS }).map((_, bit) => (
                    <div key={bit} className="flex items-center border-b border-slate-100 py-1">
                      <span className="inline-block w-10 shrink-0 text-xs text-slate-500">#{bit.toString().padStart(2, "0")}</span>
                      <input
                        className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                        value={channelNames[bit] ?? `Bit${bit}`}
                        onChange={(e) => updateAt(["Channel name", bit], e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Timing */}
              <div className="min-w-0 grow overflow-auto" ref={timingScrollRef}>
                <div className="flex items-center justify-between px-3 py-2">
                  <h2 className="text-sm font-medium text-slate-700">Timing</h2>
                  {!usingSeqImportPreview && (
                    <button onClick={() => addTiming()} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm hover:bg-slate-50">
                      + Add timing
                    </button>
                  )}
                </div>

                <div
                  className={[
                    "flex gap-2 px-3 pb-3 w-full overflow-x-auto",
                    hoverSeqDelete === seqIndex ? "bg-rose-50/60" : "",
                  ].join(" ")}
                >
                  {renderTimingStrip()}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
