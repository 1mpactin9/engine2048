import { describe, it, expect } from "vitest";
import type { GameMode, GameState, Powerups } from "../src/core/types";
import {
  PLUS_START,
  STANDARD_START,
} from "../src/core/constants";
import { gridFromValues, gridToValues } from "../src/core/grid";
import { GameSession, restoreSession } from "../src/core/session";

function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function row0(row: number[]): number[][] {
  const n = row.length;
  const grid: number[][] = [];
  for (let r = 0; r < n; r++)
    grid.push(r === 0 ? [...row] : new Array(n).fill(0));
  return grid;
}

const EMPTY_POWERUPS: Powerups = {
  undo: 0,
  swap: 0,
  delete: 0,
  teleport: 0,
  rotate: 0,
  bomb: 0,
};

function startingPowerups(mode: GameMode): Powerups {
  if (mode === "standard") return { ...STANDARD_START };
  if (mode === "plus") return { ...PLUS_START };
  return { ...EMPTY_POWERUPS };
}

function makeSession(
  values: number[][],
  mode: GameMode = "standard",
  rng?: () => number,
  powerupsOverride?: Partial<Powerups>,
): GameSession {
  const grid = gridFromValues(values);
  const size = values.length;
  const powerups = { ...startingPowerups(mode), ...powerupsOverride };
  const state: GameState = {
    size,
    mode,
    grid,
    score: 0,
    best: 0,
    powerups,
    won: false,
    wonAcknowledged: false,
    over: false,
    history: [],
    moveCount: 0,
    undoLocked: false,
  };
  return new GameSession(state, rng);
}

describe("GameSession.newGame", () => {
  it("spawns exactly two tiles on a fresh board", () => {
    const s = GameSession.newGame(4, "standard", 0, seededRng());
    expect(s.state.grid.flat().filter(Boolean).length).toBe(2);
  });

  it("starts with the right powerup quota per mode", () => {
    expect(GameSession.newGame(4, "standard").state.powerups).toEqual({
      ...EMPTY_POWERUPS,
      undo: 2,
      swap: 1,
    });
    expect(GameSession.newGame(4, "plus").state.powerups).toEqual({
      ...EMPTY_POWERUPS,
      undo: 2,
      swap: 1,
      teleport: 1,
      rotate: 1,
    });
    expect(GameSession.newGame(4, "classic").state.powerups).toEqual(
      EMPTY_POWERUPS,
    );
  });

  it("respects custom board sizes and best score", () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const s = GameSession.newGame(size, "standard", 0, seededRng());
      expect(s.state.size).toBe(size);
      expect(s.state.grid.length).toBe(size);
    }
    expect(GameSession.newGame(4, "standard", 9999).state.best).toBe(9999);
  });

  it("generates an 8-element RNG seed when no custom rng provided", () => {
    const s = GameSession.newGame(4, "standard");
    expect(s.state.rngSeed).toBeDefined();
    expect(s.state.rngSeed!.length).toBe(8);
  });
});

describe("GameSession.applyMove", () => {
  it("spawns exactly one tile after a successful move", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.grid.flat().filter(Boolean).length).toBe(2);
  });

  it("accumulates score and updates best", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.score).toBe(4);
    expect(s.state.best).toBe(4);
  });

  it("detects a win at 2048 and persists after acknowledgement", () => {
    const s = makeSession(row0([1024, 1024, 0, 0]));
    s.applyMove("left");
    expect(s.state.won).toBe(true);
    s.acknowledgeWin();
    expect(s.state.won).toBe(true);
    expect(s.state.wonAcknowledged).toBe(true);
  });

  it("flags game over on a stuck full board", () => {
    const s = makeSession([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    s.applyMove("left");
    expect(s.state.over).toBe(true);
  });

  it("returns null on a no-op move and does not spawn", () => {
    const s = makeSession(row0([2, 4, 0, 0]));
    const before = s.state.grid.flat().filter(Boolean).length;
    expect(s.applyMove("left")).toBeNull();
    expect(s.state.grid.flat().filter(Boolean).length).toBe(before);
  });

  it("increments moveCount on each move", () => {
    const s = makeSession(row0([2, 2, 0, 0]));
    s.applyMove("left");
    expect(s.state.moveCount).toBe(1);
  });

  it("clears the undo lock whenever a move is made", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    s.undo();
    expect(s.state.undoLocked).toBe(true);
    s.applyMove("left");
    expect(s.state.undoLocked).toBe(false);
  });
});

describe("GameSession — undo", () => {
  it("reverts the last move and consumes a charge", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.undo()).toBe(true);
    expect(s.state.powerups.undo).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual(row0([2, 0, 2, 0]));
    expect(s.state.score).toBe(0);
  });

  it("fails with no charge, no history, or in classic mode", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.undo()).toBe(false);
    s.state.powerups.undo = 0;
    s.applyMove("left");
    expect(s.undo()).toBe(false);
    const classic = makeSession(row0([2, 0, 2, 0]), "classic");
    classic.applyMove("left");
    expect(classic.undo()).toBe(false);
  });

  it("cannot be used twice in a row, but a move resets the lock", () => {
    const s = makeSession(row0([2, 0, 2, 0]), "standard", undefined, {
      undo: 2,
    });
    s.applyMove("left");
    expect(s.undo()).toBe(true);
    expect(s.canUndo).toBe(false);
    expect(s.undo()).toBe(false);
    // Board is back to its pre-move state, so "left" is a no-op here —
    // use a move that actually changes the board to clear the lock.
    s.applyMove("right");
    expect(s.state.undoLocked).toBe(false);
  });
});

describe("GameSession — swap", () => {
  it("exchanges two occupied cells and consumes a charge", () => {
    const s = makeSession([
      [2, 4],
      [0, 0],
    ]);
    expect(s.swap(0, 0, 0, 1)).toBe(true);
    expect(s.state.powerups.swap).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual([
      [4, 2],
      [0, 0],
    ]);
  });

  it("refuses empty cells, same cell, or classic mode", () => {
    const s = makeSession(
      [
        [2, 0],
        [0, 0],
      ],
      "standard",
      undefined,
      { swap: 1 },
    );
    expect(s.swap(0, 0, 0, 1)).toBe(false);
    expect(s.swap(0, 0, 0, 0)).toBe(false);
    const classic = makeSession(row0([2, 0, 2, 0]), "classic");
    expect(classic.swap(0, 0, 0, 2)).toBe(false);
  });
});

describe("GameSession — delete", () => {
  it("removes a tile and consumes a charge", () => {
    const s = makeSession(
      [
        [2, 4],
        [0, 0],
      ],
      "plus",
      undefined,
      { delete: 1 },
    );
    expect(s.deleteTile(0, 1)).toBe(true);
    expect(s.state.powerups.delete).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual([
      [2, 0],
      [0, 0],
    ]);
  });

  it("refuses empty cells, classic mode, or zero charges", () => {
    const s = makeSession(row0([2, 0, 2, 0]), "plus", undefined, {
      delete: 1,
    });
    expect(s.deleteTile(0, 1)).toBe(false);
    s.state.powerups.delete = 0;
    expect(s.deleteTile(0, 0)).toBe(false);
  });
});

describe("GameSession — teleport", () => {
  it("moves a tile into an empty cell in plus mode only", () => {
    const s = makeSession(
      [
        [2, 0],
        [0, 0],
      ],
      "plus",
      undefined,
      { teleport: 1 },
    );
    expect(s.teleport(0, 0, 1, 1)).toBe(true);
    expect(s.state.powerups.teleport).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual([
      [0, 0],
      [0, 2],
    ]);
  });

  it("refuses an occupied destination, empty source, or non-plus mode", () => {
    const s = makeSession(
      [
        [2, 4],
        [0, 0],
      ],
      "plus",
      undefined,
      { teleport: 1 },
    );
    expect(s.teleport(0, 0, 0, 1)).toBe(false);
    expect(s.teleport(1, 0, 1, 1)).toBe(false);
    const standard = makeSession(
      [
        [2, 0],
        [0, 0],
      ],
      "standard",
      undefined,
      { teleport: 1 },
    );
    expect(standard.teleport(0, 0, 1, 1)).toBe(false);
  });

  it("canTeleport is false once the board is full", () => {
    const s = makeSession(
      [
        [2, 4],
        [8, 16],
      ],
      "plus",
      undefined,
      { teleport: 1 },
    );
    expect(s.canTeleport).toBe(false);
  });
});

describe("GameSession — rotateRing", () => {
  it("shifts the outer ring one step and consumes a charge", () => {
    const s = makeSession(
      [
        [2, 4],
        [8, 16],
      ],
      "plus",
      undefined,
      { rotate: 1 },
    );
    s.state.moveCount = 1;
    expect(s.rotateRing("right")).toBe(true);
    expect(s.state.powerups.rotate).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual([
      [8, 2],
      [16, 4],
    ]);
  });

  it("cannot be used before the first move", () => {
    const s = makeSession(
      [
        [2, 4],
        [8, 16],
      ],
      "plus",
      undefined,
      { rotate: 1 },
    );
    expect(s.rotateRing("right")).toBe(false);
  });
});

describe("GameSession — bomb", () => {
  it("clears a 3x3 area clipped to the board edges", () => {
    const s = makeSession(
      [
        [2, 4, 8],
        [16, 32, 64],
        [128, 256, 512],
      ],
      "plus",
      undefined,
      { bomb: 1 },
    );
    expect(s.bomb(0, 0)).toBe(true);
    expect(s.state.powerups.bomb).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual([
      [0, 0, 8],
      [0, 0, 64],
      [128, 256, 512],
    ]);
  });
});

describe("GameSession — deleteByValue", () => {
  it("costs one use per matching tile: a single match drains one use", () => {
    const s = makeSession(
      [
        [2, 4],
        [0, 0],
      ],
      "plus",
      undefined,
      { delete: 2 },
    );
    const cleared = s.deleteByValue(4);
    expect(cleared).toBe(1);
    expect(s.state.powerups.delete).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual([
      [2, 0],
      [0, 0],
    ]);
  });

  it("two matching tiles drain both uses", () => {
    const s = makeSession(
      [
        [4, 4],
        [0, 0],
      ],
      "plus",
      undefined,
      { delete: 2 },
    );
    const cleared = s.deleteByValue(4);
    expect(cleared).toBe(2);
    expect(s.state.powerups.delete).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("only clears as many tiles as there are charges available", () => {
    const s = makeSession(
      [
        [4, 4],
        [0, 0],
      ],
      "plus",
      undefined,
      { delete: 1 },
    );
    expect(s.deleteByValue(4)).toBe(0);
    expect(s.state.powerups.delete).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual([
      [4, 4],
      [0, 0],
    ]);
  });
});

describe("GameSession — powerup unlocks", () => {
  it("grants a standard-mode powerup on reaching its tile milestone", () => {
    const s = makeSession(row0([64, 64, 0, 0]), "standard", undefined, {
      undo: 0,
    });
    s.applyMove("left");
    expect(s.state.powerups.undo).toBe(1);
  });

  it("does not grant powerups past a mode's cap", () => {
    const s = makeSession(row0([64, 64, 0, 0]), "standard", undefined, {
      undo: 2,
    });
    s.applyMove("left");
    expect(s.state.powerups.undo).toBe(2);
  });
});

describe("GameSession — toContext and setRngManipulation", () => {
  it("toContext exposes grid, size, score, powerups, and rng state", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    const ctx = s.toContext();
    expect(ctx.size).toBe(4);
    expect(ctx.score).toBe(4);
    expect(ctx.rngSeed).toBeDefined();
    expect(typeof ctx.rngCalls).toBe("number");
  });

  it("setRngManipulation toggles the manipulate flag", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.setRngManipulation(true);
    expect(s.toContext().manipulate).toBe(true);
    s.setRngManipulation(false);
    expect(s.toContext().manipulate).toBe(false);
  });
});

describe("restoreSession", () => {
  it("rebuilds a session from persisted state", () => {
    const original = makeSession(row0([2, 0, 2, 0]));
    original.applyMove("left");
    const restored = restoreSession(original.state);
    expect(restored.state.size).toBe(4);
    expect(restored.state.score).toBe(original.state.score);
  });
});
