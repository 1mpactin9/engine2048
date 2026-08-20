import { describe, it, expect, beforeEach } from "vitest";
import type { GameMode, GameState } from "../src/core/types";
import type { StoredData } from "../src/core/storage";
import {
  load,
  save,
  getGame,
  putGame,
  clearGames,
  DEFAULT_SETTINGS,
} from "../src/core/storage";
import { gameKey } from "../src/core/constants";

const KEY = "2048:v2";

function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  } as Storage;
}

function makeState(size = 4, mode: GameMode = "standard"): GameState {
  return {
    size,
    mode,
    grid: [],
    score: 0,
    best: 0,
    powerups: { undo: 0, swap: 0, delete: 0, teleport: 0, rotate: 0, bomb: 0 },
    won: false,
    wonAcknowledged: false,
    over: false,
    history: [],
    moveCount: 0,
    undoLocked: false,
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    memoryStorage();
});

describe("load — fresh data", () => {
  it("returns defaults when localStorage is empty", () => {
    const loaded = load();
    expect(loaded.version).toBe(2);
    expect(loaded.games).toEqual({});
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults on parse error or wrong shape", () => {
    localStorage.setItem(KEY, "not json {{{");
    expect(load().version).toBe(2);
    localStorage.setItem(KEY, "[]");
    expect(load().games).toEqual({});
  });

  it("tolerates an older/unknown version instead of wiping everything", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        settings: { theme: "dark" },
        games: { standard: makeState(4, "standard") },
      }),
    );
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.games.standard).toBeDefined();
  });

  it("drops individually malformed game entries but keeps the rest", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        games: {
          standard: makeState(4, "standard"),
          classic: { garbage: true },
        },
      }),
    );
    const loaded = load();
    expect(loaded.games.standard).toBeDefined();
    expect(loaded.games.classic).toBeUndefined();
  });

  it("fills missing settings with defaults", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 2, settings: { theme: "dark" }, games: {} }),
    );
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(DEFAULT_SETTINGS.lastSize);
  });

  it("fills missing powerup fields on an older game entry", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        games: {
          standard: {
            size: 4,
            mode: "standard",
            grid: [],
            score: 5,
            powerups: { undo: 1 },
          },
        },
      }),
    );
    const loaded = load();
    expect(loaded.games.standard.powerups).toEqual({
      undo: 1,
      swap: 0,
      delete: 0,
      teleport: 0,
      rotate: 0,
      bomb: 0,
    });
  });
});

describe("save / load round-trip", () => {
  it("saves and reloads settings and one game per mode", () => {
    const data: StoredData = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS, theme: "dark", lastSize: 6 },
      games: {
        standard: { ...makeState(4, "standard"), score: 100 },
        classic: { ...makeState(6, "classic"), score: 200 },
      },
      nextId: 5,
    };
    save(data);
    const loaded = load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.settings.lastSize).toBe(6);
    expect(getGame(loaded, "standard")!.score).toBe(100);
    expect(getGame(loaded, "classic")!.score).toBe(200);
  });
});

describe("getGame / putGame / clearGames", () => {
  it("stores and retrieves games under the correct key", () => {
    const data: StoredData = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS },
      games: {},
      nextId: 1,
    };
    putGame(data, { ...makeState(), score: 42 });
    expect(getGame(data, "standard")!.score).toBe(42);
    expect(getGame(data, "classic")).toBeUndefined();
  });

  it("putGame with a new size overwrites the same mode's slot", () => {
    const data: StoredData = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS },
      games: {},
      nextId: 1,
    };
    putGame(data, { ...makeState(4, "standard"), score: 1 });
    putGame(data, { ...makeState(6, "standard"), score: 2 });
    expect(getGame(data, "standard")!.score).toBe(2);
    expect(getGame(data, "standard")!.size).toBe(6);
    expect(Object.keys(data.games)).toEqual(["standard"]);
  });

  it("clearGames wipes all games", () => {
    const data: StoredData = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS },
      games: { standard: makeState() },
      nextId: 42,
    };
    clearGames(data);
    expect(data.games).toEqual({});
    expect(data.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});

describe("gameKey", () => {
  it("keys by mode only, so one save slot exists per mode", () => {
    expect(gameKey("standard")).toBe("standard");
    expect(gameKey("classic")).toBe("classic");
    expect(gameKey("standard")).not.toBe(gameKey("classic"));
  });
});
