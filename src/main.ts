import type { Direction } from "./core/types";
import type { ValidationResult } from "./core/validate";
import { App } from "./ui/app";
import "./styles/main.css";

declare global {
  interface Window {
    __app?: App;
    dev: {
      undo(steps?: number): void;
      delete(row: number, col: number): void;
      deleteValue(n: number): void;
      swap(r1: number, c1: number, r2: number, c2: number): void;
      addTiles(n?: number): void;
      add(a: number, b?: number, c?: number, d?: number): void;
      clear(): void;
      fill(val?: number): void;
      score(n: number): void;
      max(row: number, col: number, val?: number): void;
      moves(n: number): void;
      cheat(dir: Direction): void;
      fillPowerups(): void;
      win(): void;
      noDelay(): void;
      nextNumber(): number;
      nextLocation(): { row: number; col: number };
      validate(): ValidationResult | undefined;
      updatePosition():
        | {
            from: number;
            to: number;
            min: number;
            max: number;
            changed: boolean;
          }
        | undefined;
      bypassValidation(valueFirst?: boolean):
        | {
            feasible: boolean;
            removed: number;
            totalValue: number;
            heuristic: boolean;
            valid: boolean;
          }
        | undefined;
      help(): void;
      fixBest(): void;
      refreshScore():
        | {
            from: number;
            to: number;
            min: number;
            max: number;
            changed: boolean;
            tileCount: number;
            scoreFromMerges: number;
          }
        | undefined;
      refreshPlayAgainStatus(): void;
      log(fn: (...args: unknown[]) => unknown, intervalMs?: number): number;
      stopLog(id?: number): void;
      callNative(methodName: string, ...args: unknown[]): unknown;
      afkHighScore(): Promise<void>;
      runAutoLoop(score: number): void;
      _timers: Map<number, ReturnType<typeof setInterval>>;
      _nextId: number;
    };
  }
}

function boot(): App {
  document.getElementById("app")!.innerHTML = "";
  const app = new App();
  app.start();
  window.__app = app;
  return app;
}

let app = boot();

window.dev = {
  undo: (steps?: number) => window.__app?.__undo(steps),
  delete: (r: number, c: number) => window.__app?.__delete(r, c),
  deleteValue: (n: number) => window.__app?.__deleteValue(n),
  swap: (r1: number, c1: number, r2: number, c2: number) =>
    window.__app?.__swap(r1, c1, r2, c2),
  addTiles: (n = 1) => window.__app?.__addTiles(n),
  add: (a: number, b?: number, c?: number, d?: number) =>
    window.__app?.__add(a, b, c, d),
  clear: () => window.__app?.__clear(),
  fill: (v = 2) => window.__app?.__fill(v),
  score: (n: number) => window.__app?.__score(n),
  max: (r: number, c: number, v = 2048) => window.__app?.__max(r, c, v),
  moves: (n: number) => window.__app?.__moves(n),
  cheat: (d: Direction) => window.__app?.__cheat(d),
  fillPowerups: () => window.__app?.__fillPowerups(),
  win: () => window.__app?.__win(),
  noDelay: () => window.__app?.__noDelay(),
  nextNumber: () => window.__app?.__nextNumber() ?? -1,
  nextLocation: () => window.__app?.__nextLocation() ?? { row: -1, col: -1 },
  validate: () => window.__app?.__validate(),
  updatePosition: () => window.__app?.__updatePosition(),
  bypassValidation: (valueFirst?: boolean) =>
    window.__app?.__bypassValidation(valueFirst),
  help: () => window.__app?.__help(),
  fixBest: () => window.__app?.__fixBest(),
  refreshScore: () => window.__app?.__refreshScore(),
  refreshPlayAgainStatus: () => window.__app?.__refreshPlayAgainStatus(),
  afkHighScore: () => window.__app?.__afkHighScore() as Promise<void>,
  runAutoLoop: (score: number) => window.__app?.runAutoLoop(score),
  _timers: new Map<number, ReturnType<typeof setInterval>>(),
  _nextId: 1,
  log: function (
    fn: (...args: unknown[]) => unknown,
    intervalMs = 1000,
  ): number {
    const app = window.__app;
    if (!app) {
      console.warn("[2048] App not ready for dev.log");
      return -1;
    }
    const id = this._nextId++;
    try {
      console.log(`[dev.log#${id}]`, fn());
    } catch (e) {
      console.error(`[dev.log#${id}]`, e);
    }
    const timer = setInterval(() => {
      try {
        console.log(`[dev.log#${id}]`, fn());
      } catch (e) {
        console.error(`[dev.log#${id}]`, e);
      }
    }, intervalMs);
    this._timers.set(id, timer);
    console.log(`[dev.log] started (id=${id}, interval=${intervalMs}ms)`);
    return id;
  },
  stopLog: function (id?: number): void {
    const timers = (this as Record<string, unknown>)._timers as Map<
      number,
      ReturnType<typeof setInterval>
    >;
    if (id !== undefined && id !== null) {
      const timer = timers.get(id);
      if (timer) {
        clearInterval(timer);
        timers.delete(id);
        console.log(`[dev.log] stopped (id=${id})`);
      } else console.warn(`[dev.log] no logger found with id=${id}`);
    } else {
      for (const [, t] of timers) {
        clearInterval(t);
      }
      timers.clear();
      console.log("[dev.log] stopped all loggers");
    }
  },
  callNative: function (methodName: string, ...args: unknown[]): unknown {
    const app = window.__app;
    if (!app) {
      console.warn("[2048] App not ready for dev.callNative");
      return undefined;
    }
    const method = (app as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== "function") {
      console.warn(`[dev.callNative] no such method: ${methodName}`);
      return undefined;
    }
    try {
      const result = (method as Function).apply(app, args);
      return result;
    } catch (e) {
      console.error(`[dev.callNative] error calling ${methodName}:`, e);
      return undefined;
    }
  },
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
  import.meta.hot.accept();
}
