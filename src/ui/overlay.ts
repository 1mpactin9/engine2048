import { Icons } from "./icons";
import { KL, Spring, SpringRunner, prefersReducedMotion, resolveSpring } from "./animate";

export interface OverlayAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface OverlayOptions {
  title: string;
  titleClass?: string;
  message?: string;
  score?: number;
  danger?: boolean;
  actions: OverlayAction[];
}

export class Overlay {
  private el: HTMLElement | null = null;
  private runner: SpringRunner | null = null;
  // Current animated values for the card (Kl: scale + opacity + translateY).
  // We track these so the spring has a coherent "from" state if `show` is
  // called again before the previous spring finishes.
  private cardScale = 0;
  private cardOpacity = 0;
  private cardTranslateY = 0;

  show(opts: OverlayOptions): void {
    this.close();
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const card = document.createElement("div");
    card.className =
      "overlay__card" + (opts.danger ? " overlay__card--danger" : "");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "overlay__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = Icons.close;
    closeBtn.addEventListener("click", () => this.close());
    card.appendChild(closeBtn);
    const title = document.createElement("div");
    title.className =
      "overlay__title" + (opts.titleClass ? ` ${opts.titleClass}` : "");
    title.textContent = opts.title;
    card.appendChild(title);
    if (opts.score !== undefined) {
      const sc = document.createElement("div");
      sc.className = "overlay__score";
      sc.textContent = String(opts.score);
      card.appendChild(sc);
    }
    if (opts.message) {
      const msg = document.createElement("div");
      msg.className = "overlay__msg";
      msg.textContent = opts.message;
      card.appendChild(msg);
    }
    const actWrap = document.createElement("div");
    actWrap.className = "overlay__actions";
    for (const a of opts.actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "btn" +
        (a.primary
          ? opts.danger
            ? " btn--danger"
            : " btn--primary"
          : " btn--ghost");
      b.textContent = a.label;
      b.addEventListener("click", () => a.onClick());
      actWrap.appendChild(b);
    }
    card.appendChild(actWrap);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.el = overlay;

    // Kl animation: card scales 0→1, fades 0→1, and translates from
    // translateY(300px) up to translateY(0). Three parallel springs
    // driven by the Kl preset (duration 350ms, bounce 0.3). The overlay
    // backdrop is a static fade-in (CSS keyframe `fade-in`).
    // Respects `prefers-reduced-motion` by snapping the card to its final
    // state with no spring.
    this.cardScale = prefersReducedMotion() ? 1 : 0;
    this.cardOpacity = prefersReducedMotion() ? 1 : 0;
    this.cardTranslateY = prefersReducedMotion() ? 0 : 300;
    this.applyCardTransform(card);
    if (prefersReducedMotion()) return;
    this.runner = new SpringRunner();
    const cfg = resolveSpring(KL);
    const scaleSpring = new Spring(0, 1, cfg);
    const opacitySpring = new Spring(0, 1, cfg);
    const translateSpring = new Spring(300, 0, cfg);
    this.runner.add(scaleSpring, (v) => {
      this.cardScale = v;
      this.applyCardTransform(card);
    });
    this.runner.add(opacitySpring, (v) => {
      this.cardOpacity = v;
      this.applyCardTransform(card);
    });
    this.runner.add(translateSpring, (v) => {
      this.cardTranslateY = v;
      this.applyCardTransform(card);
    });
    this.runner.start();
  }

  private applyCardTransform(card: HTMLElement): void {
    card.style.opacity = String(this.cardOpacity);
    card.style.transform = `scale(${this.cardScale}) translateY(${this.cardTranslateY}px)`;
  }

  close(): void {
    this.runner?.stop();
    this.runner = null;
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  get isOpen(): boolean {
    return this.el !== null;
  }
}
