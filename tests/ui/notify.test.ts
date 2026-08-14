/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NotificationCenter } from "../../src/ui/notify";

describe("NotificationCenter", () => {
  let parent: HTMLElement;
  let nc: NotificationCenter;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
    nc = new NotificationCenter(parent);
  });

  afterEach(() => {
    parent.remove();
  });

  it("creates a notify-stack element", () => {
    expect(parent.querySelector(".notify-stack")).not.toBeNull();
  });

  it("show creates a card with the message and role=status", () => {
    nc.show("Test notification");
    const card = parent.querySelector(".notify-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Test notification");
    expect(card?.getAttribute("role")).toBe("status");
  });

  it("renders an icon when provided", () => {
    nc.show("With icon", { icon: '<svg viewBox="0 0 24 24"></svg>' });
    expect(parent.querySelector(".notify-card__icon svg")).not.toBeNull();
  });

  it("renders close button and progress bar fill", () => {
    nc.show("UI");
    expect(parent.querySelector(".notify-card__close")).not.toBeNull();
    expect(parent.querySelector(".notify-card__bar-fill")).not.toBeNull();
  });

  it("stacks multiple notifications", () => {
    nc.show("First");
    nc.show("Second");
    expect(parent.querySelectorAll(".notify-card").length).toBe(2);
  });

  it("close button marks card as leaving", () => {
    nc.show("Close me");
    const card = parent.querySelector(".notify-card")!;
    card
      .querySelector(".notify-card__close")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(card.classList.contains("is-leaving")).toBe(true);
  });
});
