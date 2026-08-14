/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Input } from "../../src/ui/input";
import type { Direction } from "../../src/core/types";

describe("Input — keyboard mapping", () => {
  let target: HTMLElement;
  let onMove: ReturnType<typeof vi.fn>;
  let onShortcut: ReturnType<typeof vi.fn>;
  let input: Input;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    onMove = vi.fn();
    onShortcut = vi.fn();
    input = new Input(target, { onMove, onShortcut });
  });

  afterEach(() => {
    input.destroy();
    target.remove();
  });

  it("Arrow keys map to correct Directions", () => {
    const dirs: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    for (const [key, dir] of Object.entries(dirs)) {
      onMove.mockClear();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      expect(onMove).toHaveBeenCalledWith(dir);
    }
  });

  it("WASD maps to directions in both cases", () => {
    const map: Record<string, Direction> = {
      w: "up",
      a: "left",
      s: "down",
      d: "right",
      W: "up",
      D: "right",
    };
    for (const [key, dir] of Object.entries(map)) {
      onMove.mockClear();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      expect(onMove).toHaveBeenCalledWith(dir);
    }
  });

  it("U triggers undo and E triggers delete shortcut", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "u", bubbles: true }),
    );
    expect(onShortcut).toHaveBeenCalledWith("undo");
    onShortcut.mockClear();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "e", bubbles: true }),
    );
    expect(onShortcut).toHaveBeenCalledWith("delete");
  });

  it("non-direction keys do not trigger onMove", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", bubbles: true }),
    );
    expect(onMove).not.toHaveBeenCalled();
  });

  it("destroy removes key listeners", () => {
    input.destroy();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("Input — touch swipe detection", () => {
  let target: HTMLElement;
  let onMove: ReturnType<typeof vi.fn>;
  let input: Input;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    onMove = vi.fn();
    input = new Input(target, { onMove });
  });

  afterEach(() => {
    input.destroy();
    target.remove();
  });

  it("horizontal swipe right triggers right", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 200, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("right");
  });

  it("vertical swipe down triggers down", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 100, clientY: 200 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("down");
  });

  it("below threshold does not trigger", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 110, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).not.toHaveBeenCalled();
  });
});
