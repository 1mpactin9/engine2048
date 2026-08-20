import type {
  AutoAction,
  Direction,
  EngineContext,
  GameMode,
  GameState,
} from "../core/types";
import { DEFAULT_MODE, DEFAULT_SIZE } from "../core/constants";
import {
  type StoredData,
  clearGames,
  getGame,
  load,
  putGame,
  save,
} from "../core/storage";
import { GameSession, restoreSession } from "../core/session";
import { usageProfile, type UsageMode } from "../core/usage";
import { WasmEngine } from "../engine/wasm";
import { BoardRenderer } from "./board";
import { Input } from "./input";
import { SettingsPopover } from "./controls";
import { NotificationCenter } from "./notify";
import { Icons } from "./icons";
import { currentResolved, setThemePref, toggleTheme } from "./theme";
import { Overlay } from "./overlay";
import { animateModeBadge, bumpScore, setScore } from "./scores";

type Armed = "none" | "swap" | "delete" | "teleport" | "bomb";

export class App {
  private data: StoredData;
  private session!: GameSession;
  private board!: BoardRenderer;
  private input!: Input;
  private popover!: SettingsPopover;
  private notifications!: NotificationCenter;
  private overlay = new Overlay();

  private size: number;
  private mode: GameMode;
  private pendingNew = false;
  private armed: Armed = "none";
  private autoOn = false;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private autoLoopTarget: number | null = null;
  private autoLoopStart: number | null = null;
  private wasOver = false;
  private lastScore = 0;
  private lastBest = 0;
  private lastSize: number;
  private lastMode: GameMode;
  private lastBadgeMode: string | null = null;

  private scoreVal!: HTMLElement;
  private bestVal!: HTMLElement;
  private powerupsPanel!: HTMLElement;
  private undoBtn!: HTMLElement;
  private swapBtn!: HTMLElement;
  private deleteBtn!: HTMLElement;
  private teleportBtn!: HTMLElement;
  private rotateLeftBtn!: HTMLElement;
  private rotateRightBtn!: HTMLElement;
  private bombBtn!: HTMLElement;
  private newGameBtn!: HTMLElement;
  private themeBtn!: HTMLElement;
  private modeBadge!: HTMLElement;
  private gameOverBar!: HTMLElement;

  constructor() {
    this.data = load();
    this.size = this.data.settings.lastSize || DEFAULT_SIZE;
    this.mode = this.data.settings.lastMode || DEFAULT_MODE;
    this.lastSize = this.size;
    this.lastMode = this.mode;
  }

  start(): void {
    setThemePref(this.data.settings.theme);
    this.buildDOM();
    this.loadGame(this.size, this.mode);
    if (this.data.settings.autoOn) this.startAuto();
  }

  private buildDOM(): void {
    const app = document.getElementById("app")!;
    this.notifications = new NotificationCenter(app);

    const topbar = document.createElement("header");
    topbar.className = "topbar";

    const left = document.createElement("div");
    left.className = "topbar__left";

    this.popover = new SettingsPopover({
      theme: this.data.settings.theme,
      autoOn: this.data.settings.autoOn,
      usageMode: this.data.settings.usageMode,
      autoDepth: this.data.settings.autoDepth,
      autoPowerups: this.data.settings.autoPowerups,
      rngManip: this.data.settings.rngManip,
      deterministic: this.data.settings.deterministic,
      mode: this.mode,
      size: this.size,
      onTheme: (p) => this.onThemePref(p),
      onAuto: (on) => this.toggleAuto(on),
      onUsageMode: (mode) => this.onUsageMode(mode),
      onAutoDepth: (d) => this.onAutoDepth(d),
      onAutoPowerups: (on) => this.onAutoPowerups(on),
      onRngManip: (on) => this.onRngManip(on),
      onDeterministic: (on) => this.onDeterministic(on),
      onMode: (m) => this.switchTo(this.size, m),
      onSize: (s) => this.switchTo(s, this.mode),
      onClearAll: () => this.confirmClearAll(),
    });

    const logoBlock = document.createElement("div");
    logoBlock.className = "logo-block";
    const logo = document.createElement("div");
    logo.className = "logo";
    logo.textContent = "2048";
    const modeBadge = document.createElement("div");
    modeBadge.className = "mode-badge";
    modeBadge.textContent = this.mode;
    logoBlock.append(logo, modeBadge);
    this.modeBadge = modeBadge;

    left.append(this.popover.el, logoBlock);

    const actions = document.createElement("div");
    actions.className = "topbar__actions";

    const scores = document.createElement("div");
    scores.className = "scores";
    const scoreBox = this.makeScoreBox("Score");
    const bestBox = this.makeScoreBox("Best");
    this.scoreVal = scoreBox.value;
    this.bestVal = bestBox.value;
    scores.append(scoreBox.box, bestBox.box);

    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "icon-btn icon-btn--theme";
    themeBtn.setAttribute("aria-label", "Toggle theme");
    themeBtn.innerHTML = currentResolved() === "dark" ? Icons.sun : Icons.moon;
    themeBtn.addEventListener("click", () => this.onThemeToggle());

    const newGameBtn = document.createElement("button");
    newGameBtn.type = "button";
    newGameBtn.className = "btn btn--primary topbar__primary";
    newGameBtn.textContent = "New Game";
    newGameBtn.addEventListener("click", () => {
      if (this.pendingNew) this.resumeGame();
      else this.confirmNewGame();
    });

    actions.append(scores, themeBtn, newGameBtn);
    topbar.append(left, actions);

    const shell = document.createElement("main");
    shell.className = "app";

    const stage = document.createElement("div");
    stage.className = "stage";
    this.board = new BoardRenderer(stage);

    const powerupsPanel = document.createElement("div");
    powerupsPanel.className = "powerups-panel";
    this.undoBtn = this.makePowerupBtn(Icons.undo, "Undo", "undo");
    this.swapBtn = this.makePowerupBtn(Icons.swap, "Swap", "swap");
    this.deleteBtn = this.makePowerupBtn(Icons.delete, "Delete", "delete");
    this.teleportBtn = this.makePowerupBtn(
      Icons.teleport,
      "Teleport",
      "teleport",
    );
    this.rotateLeftBtn = this.makePowerupBtn(
      Icons.rotate,
      "Rotate left",
      "rotate-left",
    );
    this.rotateLeftBtn.classList.add("powerup-btn--rotate-left");
    this.rotateRightBtn = this.makePowerupBtn(
      Icons.rotate,
      "Rotate right",
      "rotate-right",
    );
    this.rotateRightBtn.classList.add("powerup-btn--rotate-right");
    this.bombBtn = this.makePowerupBtn(Icons.bomb, "Bomb", "bomb");
    powerupsPanel.append(
      this.undoBtn,
      this.swapBtn,
      this.deleteBtn,
      this.teleportBtn,
      this.rotateLeftBtn,
      this.rotateRightBtn,
      this.bombBtn,
    );
    this.powerupsPanel = powerupsPanel;

    const gameOverBar = document.createElement("div");
    gameOverBar.className = "game-over-bar";
    const goBtn = document.createElement("button");
    goBtn.type = "button";
    goBtn.className = "game-over-bar__action btn btn--primary";
    goBtn.textContent = "Play Again";
    goBtn.addEventListener("click", () => this.confirmNewGame());
    gameOverBar.append(goBtn);
    this.gameOverBar = gameOverBar;

    stage.append(powerupsPanel, gameOverBar);
    shell.append(stage);
    app.append(topbar, shell);

    this.newGameBtn = newGameBtn;
    this.themeBtn = themeBtn;

    this.input = new Input(this.board.el, {
      onMove: (d) => this.doMove(d),
      onShortcut: (k) => {
        if (k === "undo") this.powerupUndo();
        else if (k === "delete") this.powerupDelete();
      },
    });
  }

  private makeScoreBox(label: string): {
    box: HTMLElement;
    value: HTMLElement;
  } {
    const box = document.createElement("div");
    box.className = "score-box" + (label === "Best" ? " score-box--best" : "");
    const lab = document.createElement("div");
    lab.className = "score-box__label";
    lab.textContent = label;
    const val = document.createElement("div");
    val.className = "score-box__value";
    val.textContent = "0";
    box.append(lab, val);
    return { box, value: val };
  }

  private makePowerupBtn(
    icon: string,
    label: string,
    kind:
      | "undo"
      | "swap"
      | "delete"
      | "teleport"
      | "rotate-left"
      | "rotate-right"
      | "bomb",
  ): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "powerup-btn";
    btn.setAttribute("aria-label", label);
    const iconSpan = document.createElement("span");
    iconSpan.className = "powerup-btn__icon";
    iconSpan.innerHTML = icon;
    const tooltip = document.createElement("span");
    tooltip.className = "powerup-btn__tooltip";
    tooltip.textContent = label;
    const count = document.createElement("span");
    count.className = "powerup-btn__count";
    count.textContent = "0";
    const cancel = document.createElement("span");
    cancel.className = "powerup-btn__cancel";
    cancel.setAttribute("aria-label", "Cancel");
    cancel.innerHTML = Icons.close;
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cancelPowerup();
    });
    btn.append(iconSpan, count, tooltip, cancel);
    btn.addEventListener("click", () => {
      if (kind === "undo") this.powerupUndo();
      else if (kind === "swap") this.powerupSwap();
      else if (kind === "delete") this.powerupDelete();
      else if (kind === "teleport") this.powerupTeleport();
      else if (kind === "rotate-left") this.powerupRotate("left");
      else if (kind === "rotate-right") this.powerupRotate("right");
      else this.powerupBomb();
    });
    btn.dataset.kind = kind;
    return btn;
  }

  private loadGame(size: number, mode: GameMode, forceNew = false): void {
    this.mode = mode;
    const saved = !forceNew
      ? getGame(this.data, { mode, size })
      : undefined;
    let state: GameState;
    if (saved) {
      state = saved;
      this.size = state.size;
      this.session = restoreSession(state);
    } else {
      this.size = size;
      this.session = GameSession.newGame(
        size,
        mode,
        saved ? (saved as GameState).best : 0,
        undefined,
        this.data.settings.rngManip,
      );
      putGame(this.data, this.session.state);
      this.persist();
    }
    this.session.setRngManipulation(this.data.settings.rngManip);
    this.session.setUsageMode(this.data.settings.usageMode);
    this.pendingNew = false;
    this.wasOver = false;
    this.board.setSize(this.size);
    this.board.fullRender(this.session.state.grid, !saved);
    this.updateUI();
    this.handleWinOver();
  }

  private switchTo(size: number, mode: GameMode): void {
    const sizeChanged = size !== this.size;
    const modeChanged = mode !== this.mode;
    if (!sizeChanged && !modeChanged) return;
    this.saveCurrent();
    this.overlay.close();
    this.cancelPowerup();
    this.data.settings.lastSize = size;
    this.data.settings.lastMode = mode;
    this.persist();
    // Changing board size always starts a fresh board at that size, since
    // an in-progress grid can't be resized in place. Changing mode alone
    // resumes that mode's saved game (or starts one) at its own size.
    if (sizeChanged) {
      const best = modeChanged
        ? (getGame(this.data, { mode, size })?.best ?? 0)
        : this.session.state.best;
      this.mode = mode;
      this.session = GameSession.newGame(
        size,
        mode,
        best,
        undefined,
        this.data.settings.rngManip,
      );
      this.size = size;
      putGame(this.data, this.session.state);
      this.persist();
      this.session.setRngManipulation(this.data.settings.rngManip);
      this.session.setUsageMode(this.data.settings.usageMode);
      this.pendingNew = false;
      this.board.setSize(size);
      this.board.fullRender(this.session.state.grid, true);
      this.updateUI();
      this.wasOver = this.session.state.over;
      this.handleWinOver();
    } else {
      this.loadGame(size, mode);
    }
    this.popover.update({ size: this.size, mode });
  }

  private doMove(dir: Direction): void {
    if (this.board.isSelecting) return;
    if (this.session.state.over) return;
    const transcript = this.session.applyMove(dir);
    if (!transcript) return;
    this.board.animateMove(transcript);
    bumpScore(this.scoreVal);
    if (this.pendingNew) this.pendingNew = false;
    this.saveCurrent();
    this.updateUI();
    this.handleWinOver();
  }

  private confirmNewGame(): void {
    const s = this.session.state;
    const inProgress = !s.over && s.moveCount > 0 && !this.pendingNew;
    if (inProgress) {
      this.overlay.show({
        title: "Start a new game?",
        message: "Your current game will be replaced.",
        actions: [
          { label: "Cancel", onClick: () => this.overlay.close() },
          { label: "New Game", primary: true, onClick: () => this.newGame() },
        ],
      });
    } else {
      this.newGame();
    }
  }

  private newGame(): void {
    this.overlay.close();
    this.cancelPowerup();
    const prevOver = this.session.state.over;
    const best = this.session.state.best;
    this.session = GameSession.newGame(
      this.size,
      this.mode,
      best,
      undefined,
      this.data.settings.rngManip,
    );
    this.session.setRngManipulation(this.data.settings.rngManip);
    this.session.setUsageMode(this.data.settings.usageMode);
    this.wasOver = false;
    this.pendingNew = !prevOver;
    if (!this.pendingNew) this.saveCurrent();
    this.board.setSize(this.size);
    this.board.fullRender(this.session.state.grid, true);
    this.updateUI();
  }

  private resumeGame(): void {
    if (!this.pendingNew) return;
    const saved = getGame(this.data, { mode: this.mode, size: this.size });
    if (!saved || saved.over || saved.moveCount === 0) {
      this.pendingNew = false;
      this.updatePrimaryButton();
      return;
    }
    this.session = restoreSession(saved);
    this.session.setRngManipulation(this.data.settings.rngManip);
    this.session.setUsageMode(this.data.settings.usageMode);
    this.pendingNew = false;
    this.wasOver = false;
    this.board.fullRender(this.session.state.grid);
    this.updateUI();
  }

  private powerupUndo(): void {
    if (!this.session.canUndo) return;
    this.clearPendingNew();
    this.session.undo();
    this.saveCurrent();
    this.board.fullRender(this.session.state.grid);
    this.updateUI();
    this.handleWinOver();
  }

  private powerupSwap(): void {
    if (!this.session.canSwap || this.board.isSelecting) {
      if (this.board.isSelecting) this.cancelPowerup();
      return;
    }
    this.stopAuto();
    this.clearPendingNew();
    this.armed = "swap";
    this.board.enterSelectMode(2, (cells) => {
      if (cells.length === 2) {
        const ok = this.session.swap(
          cells[0].row,
          cells[0].col,
          cells[1].row,
          cells[1].col,
        );
        if (ok) {
          this.saveCurrent();
          this.board.animateSwap(cells[0].id, cells[1].id);
          this.armed = "none";
        }
      }
      this.updateUI();
    });
    this.updateUI();
  }

  private powerupDelete(): void {
    if (!this.session.canDelete || this.board.isSelecting) {
      if (this.board.isSelecting) this.cancelPowerup();
      return;
    }
    this.stopAuto();
    this.clearPendingNew();
    this.armed = "delete";
    this.board.enterSelectMode(1, (cells) => {
      const [cell] = cells;
      if (cell) {
        const value = this.session.state.grid[cell.row][cell.col]?.value;
        if (value !== undefined) {
          const ids = this.session.state.grid
            .flat()
            .filter((c) => c?.value === value)
            .map((c) => c!.id);
          const cleared = this.session.deleteByValue(value);
          if (cleared > 0) {
            this.saveCurrent();
            this.board.animateClear(ids);
            this.armed = "none";
          }
        }
      }
      this.updateUI();
    });
    this.updateUI();
  }

  private powerupTeleport(): void {
    if (!this.session.canTeleport || this.board.isSelecting) {
      if (this.board.isSelecting) this.cancelPowerup();
      return;
    }
    this.stopAuto();
    this.clearPendingNew();
    this.armed = "teleport";
    this.board.enterSelectMode(
      2,
      (cells) => {
        if (cells.length === 2) {
          const [from, to] = cells;
          const ok = this.session.teleport(
            from.row,
            from.col,
            to.row,
            to.col,
          );
          if (ok) {
            this.saveCurrent();
            this.board.animateTeleport(from.id, to.row, to.col);
            this.armed = "none";
          }
        }
        this.updateUI();
      },
      true,
    );
    this.updateUI();
  }

  private powerupRotate(direction: "left" | "right"): void {
    if (this.board.isSelecting) {
      this.cancelPowerup();
      return;
    }
    if (!this.session.canRotate) return;
    this.stopAuto();
    this.clearPendingNew();
    const n = this.size;
    const ring: { row: number; col: number }[] = [];
    for (let c = 0; c < n; c++) ring.push({ row: 0, col: c });
    for (let r = 1; r < n; r++) ring.push({ row: r, col: n - 1 });
    for (let c = n - 2; c >= 0; c--) ring.push({ row: n - 1, col: c });
    for (let r = n - 2; r >= 1; r--) ring.push({ row: r, col: 0 });
    const grid = this.session.state.grid;
    const before = ring.map((p) => grid[p.row][p.col]);

    if (!this.session.rotateRing(direction)) {
      this.updateUI();
      return;
    }
    this.saveCurrent();

    const shift = direction === "right" ? 1 : -1;
    const moves: { id: number; row: number; col: number }[] = [];
    ring.forEach((p, i) => {
      const from = before[(i - shift + before.length) % before.length];
      if (from) moves.push({ id: from.id, row: p.row, col: p.col });
    });
    this.board.animateRingShift(moves);
    this.updateUI();
  }

  private powerupBomb(): void {
    if (!this.session.canBomb || this.board.isSelecting) {
      if (this.board.isSelecting) this.cancelPowerup();
      return;
    }
    this.stopAuto();
    this.clearPendingNew();
    this.armed = "bomb";
    this.board.enterSelectMode(
      1,
      (cells) => {
        const [center] = cells;
        if (center && this.session.bomb(center.row, center.col)) {
          this.saveCurrent();
          this.board.fullRender(this.session.state.grid);
          this.armed = "none";
        }
        this.updateUI();
      },
      true,
    );
    this.updateUI();
  }

  private cancelPowerup(): void {
    if (this.armed === "none" && !this.board.isSelecting) return;
    this.board.exitSelectMode();
    this.armed = "none";
    this.updateUI();
  }

  private updateUI(): void {
    const s = this.session.state;
    const switched = this.lastSize !== this.size || this.lastMode !== this.mode;
    let dir: "down" | "up" = "down";
    if (switched) {
      dir =
        this.size !== this.lastSize
          ? this.size > this.lastSize
            ? "down"
            : "up"
          : this.mode > this.lastMode
            ? "down"
            : "up";
    }
    const anim = switched ? { force: true, dir } : undefined;
    setScore(this.scoreVal, s.score, this.lastScore, anim);
    setScore(this.bestVal, s.best, this.lastBest, anim);
    this.lastScore = s.score;
    this.lastBest = s.best;
    this.lastSize = this.size;
    this.lastMode = this.mode;

    if (this.lastBadgeMode !== this.mode) {
      if (this.lastBadgeMode === null) this.modeBadge.textContent = this.mode;
      else animateModeBadge(this.modeBadge, this.mode);
      this.lastBadgeMode = this.mode;
    }

    this.updatePrimaryButton();

    const showPowerups = this.mode !== "classic";
    this.powerupsPanel.classList.toggle("is-visible", showPowerups);
    this.board.el.classList.toggle("board--plus", this.mode === "plus");

    this.setFrozen(s.over);

    const setPower = (
      btn: HTMLElement,
      count: number,
      enabled: boolean,
      armedKind: Armed | null = null,
    ) => {
      btn.querySelector(".powerup-btn__count")!.textContent = String(count);
      (btn as HTMLButtonElement).disabled = !enabled;
      if (armedKind) btn.classList.toggle("is-armed", this.armed === armedKind);
    };
    setPower(this.undoBtn, s.powerups.undo, this.session.canUndo);
    setPower(this.swapBtn, s.powerups.swap, this.session.canSwap, "swap");
    setPower(
      this.deleteBtn,
      s.powerups.delete,
      this.session.canDelete,
      "delete",
    );

    const isPlus = this.mode === "plus";
    this.teleportBtn.style.display = isPlus ? "" : "none";
    this.rotateLeftBtn.style.display = isPlus ? "" : "none";
    this.rotateRightBtn.style.display = isPlus ? "" : "none";
    this.bombBtn.style.display = isPlus ? "" : "none";
    if (isPlus) {
      setPower(
        this.teleportBtn,
        s.powerups.teleport,
        this.session.canTeleport,
        "teleport",
      );
      setPower(
        this.rotateLeftBtn,
        s.powerups.rotate,
        this.session.canRotate,
        null,
      );
      setPower(
        this.rotateRightBtn,
        s.powerups.rotate,
        this.session.canRotate,
        null,
      );
      setPower(this.bombBtn, s.powerups.bomb, this.session.canBomb, "bomb");
    } else {
      // Keep hidden Plus buttons' internal state fresh so the next
      // mode-switch snap is correct.
      setPower(
        this.teleportBtn,
        s.powerups.teleport,
        false,
        null,
      );
      setPower(this.rotateLeftBtn, s.powerups.rotate, false, null);
      setPower(this.rotateRightBtn, s.powerups.rotate, false, null);
      setPower(this.bombBtn, s.powerups.bomb, false, null);
    }
  }

  private updatePrimaryButton(): void {
    if (this.pendingNew) {
      this.newGameBtn.textContent = "Resume";
      this.newGameBtn.classList.remove("btn--primary");
      this.newGameBtn.classList.add("btn--ghost");
    } else {
      this.newGameBtn.textContent = "New Game";
      this.newGameBtn.classList.add("btn--primary");
      this.newGameBtn.classList.remove("btn--ghost");
    }
  }

  private handleWinOver(): void {
    const s = this.session.state;
    if (s.over) {
      if (!this.wasOver && !this.autoOn) {
        this.overlay.show({
          title: "Game over!",
          message: "No moves left.",
          score: s.score,
          actions: [
            { label: "Keep board", onClick: () => this.overlay.close() },
            { label: "New Game", primary: true, onClick: () => this.newGame() },
          ],
        });
      }
      if (!this.autoLoopTarget) this.stopAuto();
    } else if (s.won && !s.wonAcknowledged) {
      if (this.autoOn) {
        this.session.acknowledgeWin();
        this.saveCurrent();
      } else {
        this.overlay.show({
          title: "You win!",
          titleClass: "overlay__title--win",
          message: "You reached 2048!",
          actions: [
            {
              label: "Keep going",
              primary: true,
              onClick: () => this.acknowledgeWin(),
            },
            { label: "New Game", onClick: () => this.newGame() },
          ],
        });
      }
    }
    this.wasOver = s.over;
  }

  private acknowledgeWin(): void {
    this.session.acknowledgeWin();
    this.saveCurrent();
    this.overlay.close();
  }

  private setFrozen(frozen: boolean): void {
    this.board.el.classList.toggle("is-disabled", frozen);
    this.gameOverBar.classList.toggle("is-visible", frozen);
  }

  private confirmClearAll(): void {
    this.popover.close();
    this.overlay.show({
      title: "Clear all progress?",
      danger: true,
      message:
        "Every saved game and best score, across all sizes and modes, will be erased.",
      actions: [
        { label: "Cancel", onClick: () => this.overlay.close() },
        {
          label: "Clear everything",
          primary: true,
          onClick: () => {
            clearGames(this.data);
            this.persist();
            this.overlay.close();
            this.loadGame(this.size, this.mode);
          },
        },
      ],
    });
  }

  private clearPendingNew(): void {
    if (!this.pendingNew) return;
    this.pendingNew = false;
    this.saveCurrent();
    this.updatePrimaryButton();
  }

  private saveCurrent(): void {
    putGame(this.data, this.session.state);
    this.persist();
  }

  private persist(): void {
    save(this.data);
  }

  private onUsageMode(mode: UsageMode): void {
    this.data.settings.usageMode = mode;
    this.session.setUsageMode(mode);
    this.persist();
    this.popover.update({ usageMode: mode });
  }

  private onAutoDepth(depth: number): void {
    this.data.settings.autoDepth = depth;
    this.persist();
    this.popover.update({ autoDepth: depth });
  }

  private onAutoPowerups(on: boolean): void {
    this.data.settings.autoPowerups = on;
    this.persist();
    this.popover.update({ autoPowerups: on });
  }

  private onRngManip(on: boolean): void {
    this.data.settings.rngManip = on;
    this.session.setRngManipulation(on);
    this.persist();
    this.popover.update({ rngManip: on });
    this.notify(
      on ? "RNG Manipulation enabled" : "RNG Manipulation disabled",
      Icons.dice,
    );
  }

  private onDeterministic(on: boolean): void {
    this.data.settings.deterministic = on;
    this.persist();
    this.popover.update({ deterministic: on });
    this.notify(
      on
        ? "Deterministic Algorithm enabled"
        : "Deterministic Algorithm disabled",
      Icons.dice,
    );
  }

  private onThemeToggle(): void {
    this.clearPendingNew();
    const pref = toggleTheme();
    this.data.settings.theme = pref;
    this.persist();
    this.themeBtn.innerHTML =
      currentResolved() === "dark" ? Icons.sun : Icons.moon;
    this.popover.update({ theme: pref });
  }

  private onThemePref(pref: "light" | "dark" | "system"): void {
    this.clearPendingNew();
    setThemePref(pref);
    this.data.settings.theme = pref;
    this.persist();
    this.themeBtn.innerHTML =
      currentResolved() === "dark" ? Icons.sun : Icons.moon;
    this.popover.update({ theme: pref });
  }

  private notify(message: string, icon?: string): void {
    this.notifications.show(message, { icon, duration: 3000 });
  }

  private toggleAuto(force?: boolean): void {
    this.clearPendingNew();
    const next = force ?? !this.autoOn;
    if (next) this.startAuto();
    else this.stopAuto();
  }

  private startAuto(): void {
    if (this.autoOn) return;
    this.autoOn = true;
    this.data.settings.autoOn = true;
    this.persist();
    this.popover.update({ autoOn: true });
    this.updateUI();
    this.autoTick();
  }

  private stopAuto(): void {
    this.autoOn = false;
    this.autoLoopTarget = null;
    this.autoLoopStart = null;
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    this.data.settings.autoOn = false;
    this.persist();
    this.popover.update({ autoOn: false });
    this.updateUI();
  }

  private autoTick(): void {
    this.autoTimer = setTimeout(async () => {
      this.autoTimer = null;
      if (!this.autoOn) return;
      const s = this.session.state;
      if (this.board.isSelecting || this.overlay.isOpen) {
        this.stopAuto();
        return;
      }
      if (s.over) {
        if (this.autoLoopTarget !== null) {
          if (this.session.state.score >= this.autoLoopTarget) {
            const elapsed = this.autoLoopStart
              ? ((Date.now() - this.autoLoopStart) / 1000) | 0
              : 0;
            this.notify(
              `Engine completed ${this.session.state.score}` +
                (elapsed > 0 ? ` in ${elapsed}s` : ""),
              Icons.engine,
            );
            this.stopAuto();
            return;
          }
          this.newGame();
          if (this.autoOn && !this.session.state.over) this.autoTick();
          return;
        }
        this.stopAuto();
        return;
      }
      const ctx: EngineContext = {
        ...this.session.toContext(),
        depth: this.data.settings.autoDepth,
        usePowerups: this.data.settings.autoPowerups,
        deterministic: this.data.settings.deterministic,
      };
      const signature = this.boardSignature();
      const action = await WasmEngine.chooseAction(ctx);
      if (!this.autoOn) return;
      if (this.boardSignature() !== signature) {
        if (this.autoOn && !this.session.state.over) this.autoTick();
        return;
      }
      this.applyAutoAction(action);
      if (
        this.autoOn &&
        this.session.state.over &&
        this.autoLoopTarget !== null
      ) {
        if (this.session.state.score >= this.autoLoopTarget) {
          const elapsed = this.autoLoopStart
            ? ((Date.now() - this.autoLoopStart) / 1000) | 0
            : 0;
          this.notify(
            `Engine completed ${this.session.state.score} in ${elapsed}s`,
            Icons.engine,
          );
          this.stopAuto();
        } else {
          this.newGame();
          if (this.autoOn) this.autoTick();
        }
      } else if (this.autoOn && !this.session.state.over) {
        this.autoTick();
      }
    }, usageProfile(this.data.settings.usageMode).tickDelayMs);
  }

  private boardSignature(): string {
    const s = this.session.state;
    const g = s.grid;
    let out = `${s.size}:${s.score}:${s.powerups.undo}:${s.powerups.swap}:${s.powerups.delete}:`;
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      for (let c = 0; c < row.length; c++) out += (row[c]?.value ?? 0) + ",";
    }
    return out;
  }

  private applyAutoAction(action: AutoAction): void {
    switch (action.kind) {
      case "move":
        this.doMove(action.dir);
        break;
      case "delete": {
        if (!this.session.canDelete) {
          this.stopAuto();
          return;
        }
        this.clearPendingNew();
        this.session.deleteTile(action.row, action.col);
        this.saveCurrent();
        this.board.fullRender(this.session.state.grid);
        this.updateUI();
        this.notify("Engine used Delete", Icons.delete);
        this.handleWinOver();
        break;
      }
      case "swap": {
        if (!this.session.canSwap) {
          this.stopAuto();
          return;
        }
        this.clearPendingNew();
        const g = this.session.state.grid;
        const a = g[action.r1]?.[action.c1];
        const b = g[action.r2]?.[action.c2];
        if (!a || !b) {
          this.stopAuto();
          return;
        }
        this.session.swap(action.r1, action.c1, action.r2, action.c2);
        this.saveCurrent();
        this.board.animateSwap(a.id, b.id);
        this.updateUI();
        this.notify("Engine used Swap", Icons.swap);
        this.handleWinOver();
        break;
      }
      case "stop": {
        this.session.state.over = true;
        this.handleWinOver();
        if (this.autoLoopTarget !== null) {
          if (this.session.state.score >= this.autoLoopTarget) {
            const elapsed = this.autoLoopStart
              ? ((Date.now() - this.autoLoopStart) / 1000) | 0
              : 0;
            this.notify(
              `Engine completed ${this.session.state.score}` +
                (elapsed > 0 ? ` in ${elapsed}s` : ""),
              Icons.engine,
            );
            this.stopAuto();
          } else {
            this.newGame();
            if (this.autoOn) this.autoTick();
          }
        } else {
          this.stopAuto();
        }
        break;
      }
    }
  }

  destroy(): void {
    this.stopAuto();
    this.overlay.close();
    this.input.destroy();
    this.board.destroy();
  }
}
