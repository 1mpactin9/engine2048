import type {
  AutoAction,
  Direction,
  Engine,
  EngineContext,
} from "../core/types";
import { PlaceholderEngine } from "./engine";
import { usageModeToCode, DEFAULT_USAGE_MODE } from "../core/usage";

const DIR_BY_CODE: readonly Direction[] = ["up", "down", "left", "right"];

const DECISION_TIMEOUT_MS = 2000;

interface WorkerRequest {
  id: number;
  flat: Uint32Array;
  size: number;
  depth: number;
  usePowerups: boolean;
  swaps: number;
  deletes: number;
  manipulate: boolean;
  seed: Uint32Array;
  calls: number;
  usageCode: number;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  code?: number;
  action?: Uint32Array;
  error?: string;
}

let worker: Worker | null = null;
let workerDead = false;
let nextRequestId = 1;
let warnedFallback = false;

const pending = new Map<
  number,
  { resolve: (r: WorkerReply) => void; timer: ReturnType<typeof setTimeout> }
>();

function getWorker(): Worker | null {
  if (workerDead) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e: MessageEvent<WorkerReply>): void => {
      const reply = e.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      clearTimeout(entry.timer);
      entry.resolve(reply);
    };
    w.onerror = (): void => {
      failAllPending("worker error");
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };
    worker = w;
    return w;
  } catch {
    workerDead = true;
    return null;
  }
}

function failAllPending(error: string): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve({ id: 0, ok: false, error });
  }
  pending.clear();
}

function request(req: Omit<WorkerRequest, "id">): Promise<WorkerReply> {
  return new Promise((resolve) => {
    const w = getWorker();
    if (!w) {
      resolve({ id: 0, ok: false, error: "worker unavailable" });
      return;
    }
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      if (worker) {
        worker.terminate();
        worker = null;
      }
      resolve({ id, ok: false, error: "timeout" });
    }, DECISION_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, ...req });
  });
}

export const WasmEngine: Engine = {
  name: "Expectimax AI (Rust -> WASM, worker)",
  async chooseAction(ctx: EngineContext): Promise<AutoAction> {
    const { size, grid, depth, usePowerups, powerups } = ctx;
    const flat = new Uint32Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        flat[r * size + c] = grid[r]?.[c]?.value ?? 0;
      }
    }

    const seedArr = ctx.rngSeed;
    const manipulate =
      ctx.manipulate === true && Array.isArray(seedArr) && seedArr.length === 8;
    const seed = manipulate
      ? new Uint32Array(seedArr as number[])
      : new Uint32Array(0);
    const calls = ctx.rngCalls ?? 0;
    const usageCode = usageModeToCode(ctx.usageMode ?? DEFAULT_USAGE_MODE);

    const reply = await request({
      flat,
      size,
      depth,
      usePowerups,
      swaps: powerups.swap,
      deletes: powerups.delete,
      manipulate,
      seed,
      calls,
      usageCode,
    });

    if (!reply.ok) {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn(
          "[WasmEngine] search unavailable (" +
            reply.error +
            "); using random legal move.",
        );
      }
      return PlaceholderEngine.chooseAction(ctx);
    }

    try {
      if (usePowerups) {
        if (!reply.action) return PlaceholderEngine.chooseAction(ctx);
        return decodeAction(reply.action);
      }
      const code = reply.code;
      if (
        typeof code !== "number" ||
        !Number.isInteger(code) ||
        code < 0 ||
        code > 3
      ) {
        return { kind: "stop" };
      }
      return { kind: "move", dir: DIR_BY_CODE[code] };
    } catch (err) {
      console.error("[WasmEngine] failed to decode action, falling back:", err);
      return PlaceholderEngine.chooseAction(ctx);
    }
  },
};

function decodeAction(out: Uint32Array): AutoAction {
  const kind = out[0];
  if (kind === 0) {
    const d = out[1];
    if (d != null && d >= 0 && d <= 3)
      return { kind: "move", dir: DIR_BY_CODE[d] };
    return { kind: "stop" };
  }
  if (kind === 1) return { kind: "delete", row: out[1], col: out[2] };
  if (kind === 2)
    return { kind: "swap", r1: out[1], c1: out[2], r2: out[3], c2: out[4] };
  return { kind: "stop" };
}
