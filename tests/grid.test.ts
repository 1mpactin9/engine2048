import { describe, it, expect } from "vitest";
import {
  emptyCells,
  isFull,
  hasMoves,
  maxTile,
  hasTile,
  gridFromValues,
  gridToValues,
  createGrid,
  spawnTile,
  peekNextId,
  setNextId,
} from "../src/core/grid";

function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe("createGrid", () => {
  it("creates n x n grid of nulls for any supported size", () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const g = createGrid(size);
      expect(g.length).toBe(size);
      for (let r = 0; r < size; r++) {
        expect(g[r].length).toBe(size);
        for (let c = 0; c < size; c++) expect(g[r][c]).toBeNull();
      }
    }
  });
});

describe("gridFromValues / gridToValues", () => {
  it("round-trips a values array", () => {
    const vals = [
      [2, 0, 4],
      [0, 8, 0],
      [16, 0, 32],
    ];
    expect(gridToValues(gridFromValues(vals))).toEqual(vals);
  });

  it("zero values produce null cells", () => {
    const g = gridFromValues([
      [0, 0],
      [0, 0],
    ]);
    expect(g[0][0]).toBeNull();
  });

  it("assigns monotonically increasing ids starting from idSeed", () => {
    const g = gridFromValues(
      [
        [2, 4],
        [8, 16],
      ],
      10,
    );
    expect(g[0][0]!.id).toBe(10);
    expect(g[1][1]!.id).toBe(13);
  });
});

describe("emptyCells", () => {
  it("returns empty positions in row-major order", () => {
    const g = gridFromValues([
      [2, 0, 4],
      [0, 8, 0],
      [16, 0, 0],
    ]);
    expect(emptyCells(g)).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
  });

  it("returns empty array when board is full", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 32, 64],
      [128, 256, 512],
    ]);
    expect(emptyCells(g)).toHaveLength(0);
  });
});

describe("isFull / hasMoves", () => {
  it("isFull true when zero empty cells, false otherwise", () => {
    const full = gridFromValues([
      [2, 4, 8],
      [16, 32, 64],
      [128, 256, 512],
    ]);
    expect(isFull(full)).toBe(true);
    expect(
      isFull(
        gridFromValues([
          [2, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ).toBe(false);
  });

  it("hasMoves false on a stuck full board, true otherwise", () => {
    const stuck = gridFromValues([
      [2, 4],
      [8, 16],
    ]);
    expect(hasMoves(stuck)).toBe(false);
    expect(
      hasMoves(
        gridFromValues([
          [2, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
      ),
    ).toBe(true);
  });
});

describe("maxTile / hasTile", () => {
  it("maxTile returns the highest value, 0 for empty", () => {
    expect(
      maxTile(
        gridFromValues([
          [2, 4],
          [16, 32],
        ]),
      ),
    ).toBe(32);
    expect(maxTile(createGrid(4))).toBe(0);
  });

  it("hasTile returns true when any tile >= value", () => {
    const g = gridFromValues([[2, 4, 8]]);
    expect(hasTile(g, 8)).toBe(true);
    expect(hasTile(g, 64)).toBe(false);
  });
});

describe("spawnTile", () => {
  it("places a tile in an empty cell when value/at given", () => {
    const g = createGrid(4);
    const t = spawnTile(g, { value: 4, at: { row: 0, col: 1 } });
    expect(t).not.toBeNull();
    expect(g[0][1]?.value).toBe(4);
  });

  it("returns null on a full board", () => {
    const g = gridFromValues([
      [2, 4, 8, 16],
      [32, 64, 128, 2],
      [4, 8, 16, 32],
      [64, 128, 256, 512],
    ]);
    expect(spawnTile(g)).toBeNull();
  });

  it("with single empty cell, manipulation falls through to plain draw", () => {
    const g = gridFromValues([
      [2, 4, 8, 16],
      [32, 64, 128, 2],
      [4, 8, 16, 32],
      [64, 128, 0, 256],
    ]);
    let draws = 0;
    const rng = (): number => {
      draws++;
      return Math.random();
    };
    spawnTile(g, { rng, manipulate: true });
    expect(draws).toBe(2);
  });
});

describe("setNextId / peekNextId", () => {
  it("raises the counter but never lowers it", () => {
    const before = peekNextId();
    setNextId(before + 10);
    expect(peekNextId()).toBe(before + 10);
    setNextId(before + 5);
    expect(peekNextId()).toBe(before + 10);
  });
});
