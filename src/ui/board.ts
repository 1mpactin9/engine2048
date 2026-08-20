import type { Grid, MoveTranscript } from "../core/types";
import { tileColor } from "../core/constants";
import {
  AU,
  Spring,
  SpringRunner,
  prefersReducedMotion,
  resolveSpring,
} from "./animate";

interface TileRec {
  el: HTMLElement;
  id: number;
  row: number;
  col: number;
  // current animated transform state (driven by springs)
  x: number;
  y: number;
  scale: number;
}

export interface SelectResult {
  row: number;
  col: number;
  id: number;
}

const MERGE_POP_PEAK = 1.18;
const MERGE_POP_DURATION_MS = 180;

export class BoardRenderer {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private tilesLayer: HTMLElement;
  private cells: HTMLElement[] = [];
  private tiles = new Map<number, TileRec>();
  private size = 4;
  private gap = 10;
  private cellSize = 0;
  private ro: ResizeObserver;
  private currentRunner: SpringRunner | null = null;
  private selectMode: {
    max: number;
    onSelected: (cells: SelectResult[]) => void;
    picked: SelectResult[];
  } | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "board";
    this.el.style.setProperty("--n", "4");

    this.grid = document.createElement("div");
    this.grid.className = "board__grid";

    this.tilesLayer = document.createElement("div");
    this.tilesLayer.className = "board__tiles";
    this.tilesLayer.addEventListener("click", this.onTileClick);

    this.el.append(this.grid, this.tilesLayer);
    container.append(this.el);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  setSize(n: number): void {
    this.size = n;
    this.el.style.setProperty("--n", String(n));
    this.grid.innerHTML = "";
    this.cells = [];
    for (let i = 0; i < n * n; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      this.grid.appendChild(cell);
      this.cells.push(cell);
    }
    this.clearTiles();
    this.layout();
  }

  private layout(): void {
    const w = this.el.clientWidth;
    if (w === 0) return;
    const ratio = this.size >= 8 ? 0.015 : 0.026;
    const minGap = this.size >= 8 ? 5 : 6;
    this.gap = Math.max(minGap, Math.round(w * ratio));
    const inner = w - this.gap * 2;
    this.cellSize = (inner - this.gap * (this.size - 1)) / this.size;
    this.el.style.setProperty("--gap", `${this.gap}px`);
    this.el.style.setProperty("--cell", `${this.cellSize}px`);
    // If no animation is in flight, snap each tile to its grid cell.
    // Otherwise the running springs are already driving them to the
    // (about-to-be-correct) targets and re-snapshotting would jitter.
    if (this.currentRunner === null) {
      for (const rec of this.tiles.values()) {
        rec.x = this.targetX(rec);
        rec.y = this.targetY(rec);
        this.applyTransform(rec);
      }
    }
  }

  private targetX(rec: TileRec): number {
    return rec.col * (this.cellSize + this.gap);
  }

  private targetY(rec: TileRec): number {
    return rec.row * (this.cellSize + this.gap);
  }

  private applyTransform(rec: TileRec): void {
    rec.el.style.transform = `translate3d(${rec.x}px, ${rec.y}px, 0) scale(${rec.scale})`;
  }

  private faceForValue(value: number): HTMLElement {
    const face = document.createElement("div");
    face.className = "tile__face";
    const digits = Math.min(6, String(value).length);
    face.classList.add(`tile__face--d${digits}`);
    const { bg, fg } = tileColor(value);
    face.style.setProperty("--tile-bg", bg);
    face.style.setProperty("--tile-fg", fg);
    face.textContent = String(value);
    return face;
  }

  private createTile(
    id: number,
    value: number,
    row: number,
    col: number,
    spawn: boolean,
  ): TileRec {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.id = String(id);
    el.appendChild(this.faceForValue(value));
    this.tilesLayer.appendChild(el);
    const rec: TileRec = {
      el,
      id,
      row,
      col,
      x: this.targetX({ row, col } as TileRec),
      y: this.targetY({ row, col } as TileRec),
      // New tiles start at scale 0 so the spring-driven grow from 0→1 is
      // visible. Non-spawn tiles render at full size immediately.
      scale: spawn ? 0 : 1,
    };
    this.applyTransform(rec);
    this.tiles.set(id, rec);
    el.dataset.row = String(row);
    el.dataset.col = String(col);
    return rec;
  }

  private updateFace(rec: TileRec, value: number): void {
    const face = rec.el.firstElementChild as HTMLElement;
    const digits = Math.min(6, String(value).length);
    face.className = `tile__face tile__face--d${digits}`;
    const { bg, fg } = tileColor(value);
    face.style.setProperty("--tile-bg", bg);
    face.style.setProperty("--tile-fg", fg);
    face.textContent = String(value);
  }

  private pulseMerge(rec: TileRec): void {
    // "Pop" after a merge: scale 1 → MERGE_POP_PEAK → 1, driven by two
    // spring stages on a fresh runner so it doesn't tangle with the
    // slide runner that just settled.
    const runner = new SpringRunner();
    const cfg = resolveSpring({ duration: MERGE_POP_DURATION_MS, bounce: 0.7 });
    const up = new Spring(rec.scale, MERGE_POP_PEAK, cfg);
    runner.add(up, (v) => {
      rec.scale = v;
      this.applyTransform(rec);
    });
    runner.start(0, () => {
      const back = new Spring(rec.scale, 1, resolveSpring(AU));
      const r2 = new SpringRunner();
      r2.add(back, (v) => {
        rec.scale = v;
        this.applyTransform(rec);
      });
      r2.start();
    });
  }

  clearTiles(): void {
    this.currentRunner?.stop();
    this.currentRunner = null;
    for (const rec of this.tiles.values()) rec.el.remove();
    this.tiles.clear();
  }

  fullRender(grid: Grid, spawn = false): void {
    this.clearTiles();
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell) this.createTile(cell.id, cell.value, r, c, spawn);
      }
    }
    this.layout();
  }

  animateMove(transcript: MoveTranscript): void {
    if (!transcript.moved) return;
    this.currentRunner?.stop();

    // Accessibility: when the user prefers reduced motion, snap every
    // moving tile to its target and skip the spring entirely.
    if (prefersReducedMotion()) {
      for (const m of transcript.moves) {
        const rec = this.tiles.get(m.id);
        if (!rec) continue;
        rec.row = m.toRow;
        rec.col = m.toCol;
        rec.x = this.targetX(rec);
        rec.y = this.targetY(rec);
        rec.el.dataset.row = String(m.toRow);
        rec.el.dataset.col = String(m.toCol);
        if (m.mergedInto !== undefined) rec.scale = 0;
        this.applyTransform(rec);
        if (m.newValue !== undefined) this.updateFace(rec, m.newValue);
      }
      for (const m of transcript.moves) {
        if (m.mergedInto !== undefined) {
          const rec = this.tiles.get(m.id);
          if (rec) {
            rec.el.remove();
            this.tiles.delete(m.id);
          }
        }
      }
      if (transcript.spawned) {
        const s = transcript.spawned;
        const rec = this.createTile(s.id, s.value, s.row, s.col, true);
        rec.scale = 1;
        this.applyTransform(rec);
      }
      return;
    }

    const runner = new SpringRunner();
    this.currentRunner = runner;

    const survivorUpdates: { id: number; value: number }[] = [];
    const removableIds: number[] = [];
    const hasMerge = transcript.moves.some((m) => m.mergedInto !== undefined);

    for (const m of transcript.moves) {
      const rec = this.tiles.get(m.id);
      if (!rec) continue;
      rec.row = m.toRow;
      rec.col = m.toCol;
      rec.el.dataset.row = String(m.toRow);
      rec.el.dataset.col = String(m.toCol);

      const cfg = resolveSpring(AU);
      // Position springs — slide each tile to its new cell.
      const xSpring = new Spring(rec.x, this.targetX(rec), cfg);
      const ySpring = new Spring(rec.y, this.targetY(rec), cfg);
      runner.add(xSpring, (v) => {
        rec.x = v;
        this.applyTransform(rec);
      });
      runner.add(ySpring, (v) => {
        rec.y = v;
        this.applyTransform(rec);
      });

      if (m.mergedInto !== undefined) {
        // The other tile will survive; this one shrinks to nothing alongside
        // the slide so the merge looks like a collision.
        const scaleSpring = new Spring(rec.scale, 0, cfg);
        runner.add(scaleSpring, (v) => {
          rec.scale = v;
          this.applyTransform(rec);
        });
        removableIds.push(m.id);
      } else if (m.newValue !== undefined) {
        survivorUpdates.push({ id: m.id, value: m.newValue });
      }
    }

    // Spawned tile: appears at the spawn cell, scales 0 → 1. If a merge
    // happened this move, fast-forward 50ms so the spawn visually "lands"
    // right as the shrinking merged tiles vanish (matches Au.elapsed = -50
    // in the source).
    let spawnedRec: TileRec | null = null;
    if (transcript.spawned) {
      const s = transcript.spawned;
      spawnedRec = this.createTile(s.id, s.value, s.row, s.col, true);
      const scaleCfg = resolveSpring(AU);
      const scaleSpring = new Spring(0, 1, scaleCfg);
      runner.add(scaleSpring, (v) => {
        spawnedRec!.scale = v;
        this.applyTransform(spawnedRec!);
      });
    }

    runner.start(hasMerge ? -50 : 0, () => {
      // Finalize: update face values for survivors, then remove dead tiles.
      for (const { id, value } of survivorUpdates) {
        const rec = this.tiles.get(id);
        if (rec) {
          this.updateFace(rec, value);
          this.pulseMerge(rec);
        }
      }
      for (const id of removableIds) {
        const rec = this.tiles.get(id);
        if (rec) {
          rec.el.remove();
          this.tiles.delete(id);
        }
      }
      if (this.currentRunner === runner) this.currentRunner = null;
    });
  }

  animateSwap(idA: number, idB: number): void {
    const a = this.tiles.get(idA);
    const b = this.tiles.get(idB);
    if (!a || !b) return;
    this.currentRunner?.stop();

    if (prefersReducedMotion()) {
      const rowA = a.row;
      const colA = a.col;
      a.row = b.row;
      a.col = b.col;
      b.row = rowA;
      b.col = colA;
      a.x = this.targetX(a);
      a.y = this.targetY(a);
      b.x = this.targetX(b);
      b.y = this.targetY(b);
      a.el.dataset.row = String(a.row);
      a.el.dataset.col = String(a.col);
      b.el.dataset.row = String(b.row);
      b.el.dataset.col = String(b.col);
      this.applyTransform(a);
      this.applyTransform(b);
      return;
    }

    const runner = new SpringRunner();
    this.currentRunner = runner;

    const rowA = a.row;
    const colA = a.col;
    a.row = b.row;
    a.col = b.col;
    b.row = rowA;
    b.col = colA;
    a.el.dataset.row = String(a.row);
    a.el.dataset.col = String(a.col);
    b.el.dataset.row = String(b.row);
    b.el.dataset.col = String(b.col);

    const cfg = resolveSpring({ duration: 220, bounce: 0.3 });
    const ax = new Spring(a.x, this.targetX(a), cfg);
    const ay = new Spring(a.y, this.targetY(a), cfg);
    const bx = new Spring(b.x, this.targetX(b), cfg);
    const by = new Spring(b.y, this.targetY(b), cfg);
    runner.add(ax, (v) => {
      a.x = v;
      this.applyTransform(a);
    });
    runner.add(ay, (v) => {
      a.y = v;
      this.applyTransform(a);
    });
    runner.add(bx, (v) => {
      b.x = v;
      this.applyTransform(b);
    });
    runner.add(by, (v) => {
      b.y = v;
      this.applyTransform(b);
    });
    runner.start(0, () => {
      if (this.currentRunner === runner) this.currentRunner = null;
    });
  }

  enterSelectMode(
    max: number,
    onSelected: (cells: SelectResult[]) => void,
  ): void {
    this.exitSelectMode();
    this.selectMode = { max, onSelected, picked: [] };
    this.el.classList.add("is-selecting");
    for (const rec of this.tiles.values())
      rec.el.classList.add("is-targetable");
  }

  exitSelectMode(): void {
    if (!this.selectMode) return;
    this.selectMode = null;
    this.el.classList.remove("is-selecting");
    for (const rec of this.tiles.values()) {
      rec.el.classList.remove("is-targetable", "is-selected");
    }
  }

  get isSelecting(): boolean {
    return this.selectMode !== null;
  }

  private onTileClick = (e: MouseEvent): void => {
    if (!this.selectMode) return;
    const tileEl = (e.target as HTMLElement).closest(
      ".tile",
    ) as HTMLElement | null;
    if (!tileEl) return;
    const row = Number(tileEl.dataset.row);
    const col = Number(tileEl.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    const sm = this.selectMode;
    const existing = sm.picked.findIndex((p) => p.row === row && p.col === col);
    if (existing >= 0) {
      sm.picked.splice(existing, 1);
      tileEl.classList.remove("is-selected");
      return;
    }
    sm.picked.push({ row, col, id: Number(tileEl.dataset.id) });
    tileEl.classList.add("is-selected");
    if (sm.picked.length >= sm.max) {
      const result = [...sm.picked];
      this.exitSelectMode();
      sm.onSelected(result);
    }
  };

  destroy(): void {
    this.currentRunner?.stop();
    this.ro.disconnect();
  }
}
