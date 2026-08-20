import type { ThemePref } from "../core/storage";
import type { GameMode } from "../core/types";
import { SIZES } from "../core/constants";
import { Icons } from "./icons";
import type { UsageMode } from "../core/usage";
import {
  YL,
  Spring,
  SpringRunner,
  prefersReducedMotion,
  resolveSpring,
} from "./animate";

export interface SegOption {
  label: string;
  value: string;
}

export function createSegmented(
  options: SegOption[],
  active: string,
  onChange: (value: string) => void,
): { el: HTMLElement; setActive: (value: string) => void; layout: () => void } {
  const el = document.createElement("div");
  el.className = "segmented";

  const thumb = document.createElement("div");
  thumb.className = "segmented__thumb";
  el.appendChild(thumb);

  const buttons = new Map<string, HTMLElement>();

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "segmented__btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      onChange(opt.value);
    });
    buttons.set(opt.value, btn);
    el.appendChild(btn);
  }

  const position = (animate: boolean) => {
    let activeBtn: HTMLElement | undefined;
    for (const b of buttons.values()) {
      if (b.classList.contains("is-active")) {
        activeBtn = b;
        break;
      }
    }
    if (!activeBtn) return;
    if (!animate) el.classList.remove("segmented--ready");
    thumb.style.width = `${activeBtn.offsetWidth}px`;
    thumb.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
    if (!animate) {
      void thumb.offsetWidth;
      el.classList.add("segmented--ready");
    }
  };

  const setActive = (value: string) => {
    for (const [v, b] of buttons) b.classList.toggle("is-active", v === value);
    position(true);
  };

  const layout = () => position(false);

  setActive(active);
  return { el, setActive, layout };
}

export interface PopoverOpts {
  theme: ThemePref;
  autoOn: boolean;
  usageMode: UsageMode;
  autoDepth: number;
  autoPowerups: boolean;
  rngManip: boolean;
  deterministic: boolean;
  mode: GameMode;
  size: number;
  onTheme: (pref: ThemePref) => void;
  onAuto: (on: boolean) => void;
  onUsageMode: (mode: UsageMode) => void;
  onAutoDepth: (depth: number) => void;
  onAutoPowerups: (on: boolean) => void;
  onRngManip: (on: boolean) => void;
  onDeterministic: (on: boolean) => void;
  onMode: (mode: GameMode) => void;
  onSize: (size: number) => void;
  onClearAll: () => void;
}

export class SettingsPopover {
  readonly el: HTMLElement;
  private popover: HTMLElement;
  private autoSwitch!: HTMLElement;
  private rngSwitch!: HTMLElement;
  private detSwitch!: HTMLElement;
  private powerupSwitch!: HTMLElement;
  private powerupRow!: HTMLElement;
  private themeSeg!: {
    el: HTMLElement;
    setActive: (v: string) => void;
    layout: () => void;
  };
  private modeSeg!: {
    el: HTMLElement;
    setActive: (v: string) => void;
    layout: () => void;
  };
  private sizeSeg!: {
    el: HTMLElement;
    setActive: (v: string) => void;
    layout: () => void;
  };
  private depthSeg!: {
    el: HTMLElement;
    setActive: (v: string) => void;
    layout: () => void;
  };
  private usageSeg!: {
    el: HTMLElement;
    setActive: (v: string) => void;
    layout: () => void;
  };
  private open = false;
  private opts: PopoverOpts;
  // Animation state for the Yl slide. `runner` is non-null while a slide
  // is in progress. `y` is the popover's current translateY in px; the
  // target is 0 (open) or -POPOVER_RANGE (closed).
  private runner: SpringRunner | null = null;
  private y = 0;
  private static readonly POPOVER_RANGE = -70;

  constructor(opts: PopoverOpts) {
    this.opts = opts;
    const wrap = document.createElement("div");
    wrap.className = "popover-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    btn.setAttribute("aria-label", "Menu");
    btn.innerHTML = Icons.menu;

    this.popover = document.createElement("div");
    this.popover.className = "popover";
    this.popover.hidden = true;
    this.buildContent();

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    document.addEventListener("click", (e) => {
      if (this.open && !wrap.contains(e.target as Node)) this.close();
    });

    wrap.append(btn, this.popover);
    this.el = wrap;
  }

  private buildContent(): void {
    this.popover.innerHTML = "";

    const gameGroup = document.createElement("div");
    gameGroup.className = "popover__group";

    const modeLabel = document.createElement("div");
    modeLabel.className = "popover__label";
    modeLabel.textContent = "Game";

    this.modeSeg = createSegmented(
      [
        { label: "Classic", value: "classic" },
        { label: "Standard", value: "standard" },
        { label: "Plus", value: "plus" },
      ],
      this.opts.mode,
      (v) => this.opts.onMode(v as GameMode),
    );

    const sizeLabel = document.createElement("div");
    sizeLabel.className = "popover__label";
    sizeLabel.textContent = "Board Size";

    this.sizeSeg = createSegmented(
      SIZES.map((s) => ({ label: `${s}×${s}`, value: String(s) })),
      String(this.opts.size),
      (v) => this.opts.onSize(Number(v)),
    );

    gameGroup.append(modeLabel, this.modeSeg.el);

    const sizeGroup = document.createElement("div");
    sizeGroup.className = "popover__group";
    sizeGroup.append(sizeLabel, this.sizeSeg.el);

    const dividerGameSize = document.createElement("div");
    dividerGameSize.className = "popover__divider";

    const divider1 = document.createElement("div");
    divider1.className = "popover__divider";

    const themeGroup = document.createElement("div");
    themeGroup.className = "popover__group";
    const themeLabel = document.createElement("div");
    themeLabel.className = "popover__label";
    themeLabel.textContent = "Theme";
    this.themeSeg = createSegmented(
      [
        { label: "Light", value: "light" },
        { label: "Dark", value: "dark" },
        { label: "System", value: "system" },
      ],
      this.opts.theme,
      (v) => this.opts.onTheme(v as ThemePref),
    );
    themeGroup.append(themeLabel, this.themeSeg.el);

    const dividerThemeAuto = document.createElement("div");
    dividerThemeAuto.className = "popover__divider";

    const engineGroup = document.createElement("div");
    engineGroup.className = "popover__group";

    const autoRow = document.createElement("div");
    autoRow.className = "popover__row";
    const autoLabel = document.createElement("span");
    autoLabel.textContent = "Engine";
    autoLabel.className = "popover__row-label";
    const autoSwitch = document.createElement("button");
    autoSwitch.type = "button";
    autoSwitch.className = "switch" + (this.opts.autoOn ? " is-on" : "");
    autoSwitch.setAttribute("aria-label", "Toggle auto-play");
    autoSwitch.setAttribute("aria-pressed", String(this.opts.autoOn));
    autoSwitch.addEventListener("click", () =>
      this.opts.onAuto(!this.opts.autoOn),
    );
    this.autoSwitch = autoSwitch;
    autoRow.append(autoLabel, autoSwitch);

    const rngRow = document.createElement("div");
    rngRow.className = "popover__row";
    const rngLabel = document.createElement("span");
    rngLabel.textContent = "RNG Manipulation";
    rngLabel.className = "popover__row-label";
    const rngSwitch = document.createElement("button");
    rngSwitch.type = "button";
    rngSwitch.className = "switch" + (this.opts.rngManip ? " is-on" : "");
    rngSwitch.setAttribute("aria-label", "Toggle RNG manipulation");
    rngSwitch.setAttribute("aria-pressed", String(this.opts.rngManip));
    rngSwitch.addEventListener("click", () =>
      this.opts.onRngManip(!this.opts.rngManip),
    );
    this.rngSwitch = rngSwitch;
    rngRow.append(rngLabel, rngSwitch);

    const detRow = document.createElement("div");
    detRow.className = "popover__row";
    const detLabel = document.createElement("span");
    detLabel.textContent = "Deterministic Algorithm";
    detLabel.className = "popover__row-label";
    const detSwitch = document.createElement("button");
    detSwitch.type = "button";
    detSwitch.className = "switch" + (this.opts.deterministic ? " is-on" : "");
    detSwitch.setAttribute("aria-label", "Toggle deterministic algorithm");
    detSwitch.setAttribute("aria-pressed", String(this.opts.deterministic));
    detSwitch.addEventListener("click", () =>
      this.opts.onDeterministic(!this.opts.deterministic),
    );
    this.detSwitch = detSwitch;
    detRow.append(detLabel, detSwitch);

    const depthLabel = document.createElement("div");
    depthLabel.className = "popover__label";
    depthLabel.textContent = "DEPTH";
    this.depthSeg = createSegmented(
      [
        { label: "Auto", value: "0" },
        { label: "Low", value: "2" },
        { label: "Medium", value: "4" },
        { label: "High", value: "6" },
      ],
      String(this.opts.autoDepth),
      (v) => this.opts.onAutoDepth(Number(v)),
    );
    this.depthSeg.el.classList.add("segmented--compact");

    const depthField = document.createElement("div");
    depthField.className = "popover__field";
    depthField.append(depthLabel, this.depthSeg.el);

    const usageLabel = document.createElement("div");
    usageLabel.className = "popover__label";
    usageLabel.textContent = "USAGE";
    this.usageSeg = createSegmented(
      [
        { label: "Max", value: "max" },
        { label: "Balanced", value: "balanced" },
        { label: "Limit", value: "limit" },
      ],
      this.opts.usageMode,
      (v) => this.opts.onUsageMode(v as UsageMode),
    );

    const usageField = document.createElement("div");
    usageField.className = "popover__field";
    usageField.append(usageLabel, this.usageSeg.el);

    const powerupRow = document.createElement("div");
    powerupRow.className = "popover__row";
    const powerupLabel = document.createElement("span");
    powerupLabel.textContent = "Power-ups";
    powerupLabel.className = "popover__row-label";
    const powerupSwitch = document.createElement("button");
    powerupSwitch.type = "button";
    powerupSwitch.className =
      "switch" + (this.opts.autoPowerups ? " is-on" : "");
    powerupSwitch.setAttribute("aria-label", "Toggle AI power-ups");
    powerupSwitch.setAttribute("aria-pressed", String(this.opts.autoPowerups));
    powerupSwitch.addEventListener("click", () =>
      this.opts.onAutoPowerups(!this.opts.autoPowerups),
    );
    this.powerupSwitch = powerupSwitch;
    this.powerupRow = powerupRow;
    powerupRow.append(powerupLabel, powerupSwitch);

    engineGroup.append(
      autoRow,
      rngRow,
      detRow,
      depthField,
      usageField,
      powerupRow,
    );
    this.applyPowerupVisibility();

    const divider2 = document.createElement("div");
    divider2.className = "popover__divider";

    const danger = document.createElement("button");
    danger.type = "button";
    danger.className = "popover__danger";
    danger.textContent = "Clear all progress";
    danger.addEventListener("click", () => this.opts.onClearAll());

    this.popover.append(
      gameGroup,
      dividerGameSize,
      sizeGroup,
      divider1,
      themeGroup,
      dividerThemeAuto,
      engineGroup,
      divider2,
      danger,
    );
  }

  toggle(): void {
    this.open ? this.close() : this.openPopover();
  }

  private openPopover(): void {
    this.open = true;
    this.popover.hidden = false;
    // Snap to the closed offset first so the slide is visible, then
    // schedule a layout pass for the segmented thumbs. We start the Yl
    // spring after the browser has painted the initial position.
    this.y = SettingsPopover.POPOVER_RANGE;
    this.popover.style.transform = `translateY(${this.y}px)`;
    requestAnimationFrame(() => {
      this.layoutThumbs();
      this.slideTo(0);
    });
  }

  private layoutThumbs(): void {
    this.modeSeg.layout();
    this.sizeSeg.layout();
    this.themeSeg.layout();
    this.depthSeg.layout();
    this.usageSeg.layout();
  }

  /**
   * Slide the popover to `targetY` (px) using the Yl spring. The Yl config
   * is Svelte-style explicit physics:
   *   stiffness 200, damping 7, mass 0.3, velocity 50, duration ~800ms
   * The bounce comes from the natural underdamping of those constants.
   * `onSettle` fires once the spring lands (so close() can hide the element).
   * Respects `prefers-reduced-motion` by snapping straight to the target.
   */
  private slideTo(targetY: number, onSettle?: () => void): void {
    this.runner?.stop();
    if (prefersReducedMotion()) {
      this.y = targetY;
      this.popover.style.transform = `translateY(${targetY}px)`;
      this.runner = null;
      onSettle?.();
      return;
    }
    const runner = new SpringRunner();
    this.runner = runner;
    const cfg = resolveSpring({
      stiffness: YL.stiffness,
      damping: YL.damping,
      mass: YL.mass,
    });
    const spring = new Spring(this.y, targetY, {
      ...cfg,
      precision: 0.01,
    });
    runner.add(spring, (v) => {
      this.y = v;
      this.popover.style.transform = `translateY(${v}px)`;
    });
    runner.start(0, () => {
      if (this.runner === runner) this.runner = null;
      onSettle?.();
    });
  }

  close(): void {
    this.open = false;
    if (this.popover.hidden) return;
    this.slideTo(SettingsPopover.POPOVER_RANGE, () => {
      if (this.open) return; // reopened mid-close
      this.popover.hidden = true;
      this.popover.style.transform = "";
    });
    // Safety net: if the spring stalls (e.g. tab backgrounded) still hide
    // after the Yl duration so the UI never gets stuck.
    window.setTimeout(() => {
      if (this.open) return;
      this.popover.hidden = true;
      this.popover.style.transform = "";
    }, YL.durationMs + 100);
  }

  private applyPowerupVisibility(): void {
    this.powerupRow.style.display = this.opts.mode === "classic" ? "none" : "";
  }

  update(opts: Partial<PopoverOpts>): void {
    Object.assign(this.opts, opts);
    if (opts.theme !== undefined) this.themeSeg.setActive(opts.theme);
    if (opts.mode !== undefined) {
      this.modeSeg.setActive(opts.mode);
      this.applyPowerupVisibility();
    }
    if (opts.size !== undefined) this.sizeSeg.setActive(String(opts.size));
    if (opts.autoOn !== undefined) {
      this.autoSwitch.classList.toggle("is-on", opts.autoOn);
      this.autoSwitch.setAttribute("aria-pressed", String(opts.autoOn));
    }
    if (opts.autoDepth !== undefined)
      this.depthSeg.setActive(String(opts.autoDepth));
    if (opts.usageMode !== undefined) this.usageSeg.setActive(opts.usageMode);
    if (opts.autoPowerups !== undefined) {
      this.powerupSwitch.classList.toggle("is-on", opts.autoPowerups);
      this.powerupSwitch.setAttribute(
        "aria-pressed",
        String(opts.autoPowerups),
      );
    }
    if (opts.rngManip !== undefined) {
      this.rngSwitch.classList.toggle("is-on", opts.rngManip);
      this.rngSwitch.setAttribute("aria-pressed", String(opts.rngManip));
    }
    if (opts.deterministic !== undefined) {
      this.detSwitch.classList.toggle("is-on", opts.deterministic);
      this.detSwitch.setAttribute("aria-pressed", String(opts.deterministic));
    }
  }
}
