/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BoardRenderer } from "../../src/ui/board";
import type { MoveTranscript } from "../../src/core/types";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  },
);

function setup(): {
  container: HTMLElement;
  board: BoardRenderer;
  teardown: () => void;
} {
  const container = document.createElement("div");
  container.style.width = "520px";
  document.body.appendChild(container);
  const board = new BoardRenderer(container);
  return {
    container,
    board,
    teardown: () => {
      board.destroy();
      container.remove();
    },
  };
}

describe("BoardRenderer — construction and sizing", () => {
  it("creates board element with class and --n=4", () => {
    const { board, teardown } = setup();
    expect(board.el.className).toBe("board");
    expect(board.el.style.getPropertyValue("--n")).toBe("4");
    expect(board.el.querySelector(".board__grid")).not.toBeNull();
    expect(board.el.querySelector(".board__tiles")).not.toBeNull();
    teardown();
  });

  it("setSize updates --n and creates the right number of cells", () => {
    const { board, teardown } = setup();
    board.setSize(3);
    expect(board.el.querySelectorAll(".cell").length).toBe(9);
    board.setSize(8);
    expect(board.el.querySelectorAll(".cell").length).toBe(64);
    teardown();
  });
});

describe("BoardRenderer — fullRender", () => {
  it("creates a tile element per non-null cell", () => {
    const { board, teardown } = setup();
    board.setSize(4);
    const grid = [
      [{ id: 1, value: 2 }, null, null, null],
      [null, { id: 2, value: 4 }, null, null],
      [null, null, { id: 3, value: 8 }, null],
      [null, null, null, { id: 4, value: 16 }],
    ];
    board.fullRender(grid as never, false);
    expect(board.el.querySelectorAll(".tile").length).toBe(4);
    teardown();
  });

  it("spawn flag adds is-spawn class", () => {
    const { board, teardown } = setup();
    board.setSize(4);
    const grid = [[{ id: 1, value: 2 }]];
    grid.push(new Array(3).fill(null));
    grid.push(new Array(4).fill(null));
    grid.push(new Array(4).fill(null));
    board.fullRender(grid as never, true);
    const face = board.el.querySelector(".tile .tile__face");
    expect(face?.classList.contains("is-spawn")).toBe(true);
    teardown();
  });
});

describe("BoardRenderer — animations", () => {
  it("animateMove creates a spawned tile when transcript.spawned is set", () => {
    const { board, teardown } = setup();
    board.setSize(4);
    const transcript: MoveTranscript = {
      moved: true,
      gained: 4,
      moves: [{ id: 1, fromRow: 0, fromCol: 0, toRow: 0, toCol: 0 }],
      spawned: { id: 99, value: 4, row: 3, col: 3 },
    };
    board.animateMove(transcript);
    expect(board.el.querySelector('[data-id="99"]')).not.toBeNull();
    teardown();
  });

  it("animateSwap no-ops when either id is not found", () => {
    const { board, teardown } = setup();
    board.setSize(4);
    board.fullRender(
      [
        [{ id: 1, value: 2 }, null, null, null],
        [null, { id: 2, value: 4 }, null, null],
      ] as never,
      false,
    );
    const before = board.el.querySelectorAll(".tile").length;
    board.animateSwap(999, 888);
    expect(board.el.querySelectorAll(".tile").length).toBe(before);
    teardown();
  });
});

describe("BoardRenderer — select mode", () => {
  it("enterSelectMode toggles state and isSelecting getter", () => {
    const { board, teardown } = setup();
    board.setSize(4);
    board.fullRender(
      [[{ id: 1, value: 2 }, { id: 2, value: 4 }, null, null]] as never,
      false,
    );
    expect(board.isSelecting).toBe(false);
    board.enterSelectMode(2, () => {});
    expect(board.isSelecting).toBe(true);
    expect(board.el.classList.contains("is-selecting")).toBe(true);
    expect(board.el.querySelectorAll(".is-targetable").length).toBe(2);
    board.exitSelectMode();
    expect(board.isSelecting).toBe(false);
    expect(board.el.classList.contains("is-selecting")).toBe(false);
    teardown();
  });
});

describe("BoardRenderer — destroy", () => {
  it("does not throw", () => {
    const { board, teardown } = setup();
    expect(() => board.destroy()).not.toThrow();
    teardown();
  });
});
