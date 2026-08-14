export function makeParams(overrides = {}) {
  return Object.assign(
    {
      W_EMPTY: 270.0,
      W_MONO: 25.0,
      W_SMOOTH: 11.0,
      W_SNAKE: 46.0,
      SNAKE_RATIO: 0.5,
      MAX_CELLS: 6,
      defaultDepth: { 3: 5, 4: 5, 5: 3, 6: 2 },
      defaultDepthFallback: 1,
      dynamicBonus: [
        { fracDenom: 16, minEmpty: 1, bonus: 3 },
        { fracDenom: 8, minEmpty: 2, bonus: 2 },
        { fracDenom: 5, minEmpty: 3, bonus: 1 },
      ],
    },
    overrides,
  );
}

export const USAGE_PRESETS = {
  max: { MAX_CELLS: 8, nodeBudgetScale: 2.5, timeBudgetMs: 800 },
  balanced: { MAX_CELLS: 6, nodeBudgetScale: 1.0, timeBudgetMs: 200 },
  limit: { MAX_CELLS: 4, nodeBudgetScale: 0.35, timeBudgetMs: 45 },
};

export function makeParamsForUsage(usageName, overrides = {}) {
  const preset = USAGE_PRESETS[usageName] ?? USAGE_PRESETS.balanced;
  return makeParams(Object.assign({ MAX_CELLS: preset.MAX_CELLS }, overrides));
}

function log2(v) {
  return v === 0 ? 0.0 : Math.log2(v);
}

function slideLine(values, n) {
  const merged = [];
  let gained = 0;
  let i = 0;
  while (i < values.length) {
    if (i + 1 < values.length && values[i] === values[i + 1]) {
      const m = values[i] * 2;
      merged.push(m);
      gained += m;
      i += 2;
    } else {
      merged.push(values[i]);
      i += 1;
    }
  }
  while (merged.length < n) merged.push(0);
  return { merged, gained };
}

export function slideGrid(grid, n, dir) {
  const result = new Array(n * n).fill(0);
  let gained = 0;
  const lines = [];
  if (dir === 2) {
    for (let r = 0; r < n; r++) {
      const line = [];
      for (let c = 0; c < n; c++) line.push(r * n + c);
      lines.push(line);
    }
  } else if (dir === 3) {
    for (let r = 0; r < n; r++) {
      const line = [];
      for (let c = n - 1; c >= 0; c--) line.push(r * n + c);
      lines.push(line);
    }
  } else if (dir === 0) {
    for (let c = 0; c < n; c++) {
      const line = [];
      for (let r = 0; r < n; r++) line.push(r * n + c);
      lines.push(line);
    }
  } else {
    for (let c = 0; c < n; c++) {
      const line = [];
      for (let r = n - 1; r >= 0; r--) line.push(r * n + c);
      lines.push(line);
    }
  }

  for (const line of lines) {
    const values = line.map((idx) => grid[idx]).filter((v) => v !== 0);
    const { merged, gained: g } = slideLine(values, n);
    gained += g;
    for (let k = 0; k < line.length; k++) {
      result[line[k]] = merged[k];
    }
  }
  return { grid: result, gained };
}

function gridsEqual(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function heuristic(grid, n, P) {
  let empty = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) empty++;

  let smoothness = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (v === 0) continue;
      const lv = log2(v);
      if (c + 1 < n) {
        const rv = grid[r * n + c + 1];
        if (rv !== 0) smoothness -= Math.abs(lv - log2(rv));
      }
      if (r + 1 < n) {
        const dv = grid[(r + 1) * n + c];
        if (dv !== 0) smoothness -= Math.abs(lv - log2(dv));
      }
    }
  }

  let mono = 0;
  for (let r = 0; r < n; r++) {
    let inc = 0,
      dec = 0;
    for (let c = 0; c < n - 1; c++) {
      const a = log2(grid[r * n + c]);
      const b = log2(grid[r * n + c + 1]);
      if (a > b) dec += a - b;
      else inc += b - a;
    }
    mono -= Math.min(inc, dec);
  }
  for (let c = 0; c < n; c++) {
    let inc = 0,
      dec = 0;
    for (let r = 0; r < n - 1; r++) {
      const a = log2(grid[r * n + c]);
      const b = log2(grid[(r + 1) * n + c]);
      if (a > b) dec += a - b;
      else inc += b - a;
    }
    mono -= Math.min(inc, dec);
  }

  const snake = snakeScore(grid, n, P);

  return (
    P.W_EMPTY * log2(empty + 1) +
    P.W_MONO * mono +
    P.W_SMOOTH * smoothness +
    P.W_SNAKE * snake
  );
}

function snakeScore(grid, n, P) {
  if (n === 0) return 0.0;
  const weight = new Array(n * n).fill(0);
  let w = 1.0;
  for (let r = 0; r < n; r++) {
    const cols = r % 2 === 0 ? range(0, n) : range(n - 1, -1, -1);
    for (const c of cols) {
      weight[r * n + c] = w;
      w *= P.SNAKE_RATIO;
    }
  }
  const rotate = (wgt) => {
    const out = new Array(n * n).fill(0);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        out[c * n + (n - 1 - r)] = wgt[r * n + c];
      }
    }
    return out;
  };
  const dot = (wgt) => {
    let s = 0;
    for (let i = 0; i < grid.length; i++) s += log2(grid[i]) * wgt[i];
    return s;
  };
  const w0 = weight;
  const w90 = rotate(w0);
  const w180 = rotate(w90);
  const w270 = rotate(w180);
  return Math.max(dot(w0), dot(w90), dot(w180), dot(w270));
}

function range(start, endExclusive, step = 1) {
  const out = [];
  if (step > 0) for (let i = start; i < endExclusive; i += step) out.push(i);
  else for (let i = start; i > endExclusive; i += step) out.push(i);
  return out;
}

function defaultDepth(size, P) {
  return P.defaultDepth[size] ?? P.defaultDepthFallback;
}

function dynamicDepth(base, grid, n, P) {
  let empty = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) empty++;
  const area = n * n;
  let bonus = 0;
  for (const rule of P.dynamicBonus) {
    if (empty <= Math.max(Math.floor(area / rule.fracDenom), rule.minEmpty)) {
      bonus = rule.bonus;
      break;
    }
  }
  return base + bonus;
}

const DIRS = [0, 1, 2, 3];

function expectimaxMax(grid, n, depth, P) {
  if (depth === 0) return heuristic(grid, n, P);
  let best = -Infinity;
  let any = false;
  for (const dir of DIRS) {
    const { grid: ng, gained } = slideGrid(grid, n, dir);
    if (gridsEqual(ng, grid)) continue;
    any = true;
    const v = gained + expectimaxChance(ng, n, depth - 1, P);
    if (v > best) best = v;
  }
  if (!any) return -200000.0;
  return best;
}

function expectimaxChance(grid, n, depth, P) {
  const empties = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) empties.push(i);
  if (empties.length === 0 || depth === 0) return heuristic(grid, n, P);

  let sampled;
  if (empties.length <= P.MAX_CELLS) {
    sampled = empties;
  } else {
    const stride = empties.length / P.MAX_CELLS;
    sampled = [];
    for (let i = 0; i < P.MAX_CELLS; i++) {
      sampled.push(empties[Math.floor(i * stride)]);
    }
  }

  let total = 0;
  const weightEach = 1.0 / sampled.length;
  for (const idx of sampled) {
    grid[idx] = 2;
    const v2 = expectimaxMax(grid, n, depth - 1, P);
    grid[idx] = 4;
    const v4 = expectimaxMax(grid, n, depth - 1, P);
    grid[idx] = 0;

    total += weightEach * (0.9 * v2 + 0.1 * v4);
  }
  return total;
}

export function bestMove(grid, n, depth, P) {
  const d = dynamicDepth(depth, grid, n, P);
  let bestDir = null;
  let bestVal = -Infinity;
  for (const dir of DIRS) {
    const { grid: ng, gained } = slideGrid(grid, n, dir);
    if (gridsEqual(ng, grid)) continue;
    const value = gained + expectimaxChance(ng, n, d - 1, P);
    if (value > bestVal) {
      bestVal = value;
      bestDir = dir;
    }
  }
  const val = bestDir === null ? -200000.0 : bestVal;
  return { dir: bestDir, val };
}

export function suggestMove(grid, n, depthOverride, P) {
  const depth = depthOverride ?? defaultDepth(n, P);
  return bestMove(grid, n, depth, P).dir;
}
