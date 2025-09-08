// lib/wavemeter-runner.ts
import { rpcServer } from "./rpc-server";
import { getPageSnapshot } from "./pageHistory";

const WAVEMETER_KEY = "Highfinesse wavemeter"; // endpoints 中的 key
const DAQ_KEY = "usb3104 digital";         // endpoints 中的 key

type RunnerState = { running: boolean; pageId?: string; startedAt?: number; index?: number };
let state: RunnerState = { running: false };
let timer: NodeJS.Timeout | null = null;
let inTick = false;
let lastOn: number | null = null; // 上一次點亮的 channel（用來關掉）

export function isRunning(): boolean {
  return state.running === true;
}
export function getRunnerState(): RunnerState {
  return { ...state };
}

function pickSensorArray(st: any): number[] {
  const raw = st?.HighFinesse?.Sensor;
  if (Array.isArray(raw?.[0])) return (raw?.[0] as number[]) ?? [];
  return (raw as number[]) ?? [];
}
function nextEnabledIndex(startExclusive: number, enabled: number[]): number | null {
  const n = Math.max(16, enabled.length || 0);
  for (let step = 1; step <= n; step++) {
    const j = (startExclusive + step) % n;
    if (Number(enabled[j] ?? 0) === 1) return j;
  }
  return null;
}

async function turnOnChannel(idx: number) {
  // 若你的 Python 端是 args 形式，改成: rpcServer(DAQ_KEY, "set_digital_output", [idx, 1], {})
  await rpcServer(DAQ_KEY, "set_digital_output", [idx], {});
}
async function turnOffChannel(idx: number) {
  // 若你的 Python 端是 args 形式，改成: rpcServer(DAQ_KEY, "set_digital_output", [idx, 0], {})
  await rpcServer(DAQ_KEY, "set_digital_output", [idx], {});
}

async function tick() {
  if (!state.running) return;
  if (inTick) return;
  inTick = true;

  try {
    const pid = state.pageId!;
    const snap = await getPageSnapshot(pid);
    const st: any = snap.state ?? {};
    const repSec = Math.max(0.05, Number(st?.["repetition time"] ?? 1)); // 每次「切換到下一個 channel」間隔（秒）

    const enabled: number[] = st?.HighFinesse?.State ?? [];
    const s1: number[] = pickSensorArray(st); // 單位 ms（頁面說明）

    // 找到下一個開啟的 channel
    const startAt = typeof state.index === "number" ? state.index : -1;
    const idx = nextEnabledIndex(startAt, enabled);

    if (idx == null) {
      // 沒有任何 channel 開啟：把上一顆也關掉，1 秒後再檢查
      if (lastOn != null) {
        try { await turnOffChannel(lastOn); } catch {}
        lastOn = null;
      }
      scheduleNext(1_000);
      return;
    }

    // 先關掉上一顆、再打開目前這顆（避免多顆同時 ON）
    if (lastOn != null && lastOn !== idx) {
      try { await turnOffChannel(lastOn); } catch {}
    }
    try { await turnOnChannel(idx); } catch {}

    // 設定曝光（ms → s）
    const exposureMs = Number(s1[idx] ?? 1);
    const exposureSec = Math.max(0, exposureMs / 1000);
    // 若你的 Python 端是 args 形式，改成: rpcServer(WAVEMETER_KEY, "set_exposure", [1, exposureSec], {})
    await rpcServer(WAVEMETER_KEY, "set_exposure", [], { sensor: 1, exposure: exposureSec });

    // 更新狀態，排下一次 tick
    state.index = idx;
    lastOn = idx;
    scheduleNext(repSec * 1000);
  } finally {
    inTick = false;
  }
}

function scheduleNext(ms: number) {
  if (!state.running) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

export async function startRunner(pageId = "1") {
  if (state.running) return getRunnerState();
  state = { running: true, pageId, startedAt: Date.now(), index: -1 };
  // 立即啟動一次（下一個 tick 由 repetition 控制）
  scheduleNext(0);
  return getRunnerState();
}

export async function stopRunner() {
  state = { running: false, pageId: undefined, startedAt: undefined, index: undefined };
  if (timer) { clearTimeout(timer); timer = null; }
  // 安全起見把最後一顆關掉
  if (lastOn != null) {
    try { await turnOffChannel(lastOn); } catch {}
    lastOn = null;
  }
  return getRunnerState();
}
