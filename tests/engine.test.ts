import { describe, it, expect } from "vitest";
import type { EngineContext } from "../src/core/types";
import { PlaceholderEngine } from "../src/engine/engine";
import { WasmEngine } from "../src/engine/wasm";
import { gridFromValues } from "../src/core/grid";

function makeCtx(grid: number[][]): EngineContext {
  return {
    grid: gridFromValues(grid),
    size: grid.length,
    score: 0,
    powerups: {
      undo: 0,
      swap: 0,
      delete: 0,
      teleport: 0,
      rotate: 0,
      bomb: 0,
    },
    depth: 2,
    usePowerups: false,
  };
}

describe("PlaceholderEngine", () => {
  it("returns a legal move direction on a board with moves", () => {
    const action = PlaceholderEngine.chooseAction(
      makeCtx([
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
    );
    expect(action.kind).toBe("move");
    if (action.kind === "move") {
      expect(["up", "down", "left", "right"]).toContain(action.dir);
    }
  });

  it("returns stop when no legal moves exist", () => {
    const action = PlaceholderEngine.chooseAction(
      makeCtx([
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ]),
    );
    expect(action.kind).toBe("stop");
  });

  it("engine exposes a name", () => {
    expect(PlaceholderEngine.name).toContain("Placeholder");
  });
});

describe("WasmEngine", () => {
  it("exposes a name", () => {
    expect(typeof WasmEngine.name).toBe("string");
  });

  it("chooseAction returns a Promise resolving to a valid AutoAction kind", async () => {
    const result = WasmEngine.chooseAction(
      makeCtx([
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
    );
    expect(result).toBeInstanceOf(Promise);
    const action = await result;
    expect(["move", "stop", "swap", "delete"]).toContain(action.kind);
  });

  it("returns stop when no legal moves", async () => {
    const action = await WasmEngine.chooseAction(
      makeCtx([
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ]),
    );
    expect(action.kind).toBe("stop");
  });
});
