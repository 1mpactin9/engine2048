import {
  makeParams,
  makeParamsForUsage,
  slideGrid,
  suggestMove,
} from "./algo.mjs";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function anyMovePossible(grid, n) {
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) return true;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (c + 1 < n && grid[r * n + c + 1] === v) return true;
      if (r + 1 < n && grid[(r + 1) * n + c] === v) return true;
    }
  }
  return false;
}

function spawnTile(grid, n, rng, fourProb) {
  const empties = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) empties.push(i);
  if (empties.length === 0) return false;
  const idx = empties[Math.floor(rng() * empties.length)];
  grid[idx] = rng() < fourProb ? 4 : 2;
  return true;
}

export function playGame({
  n = 4,
  depth,
  P,
  seed,
  fourProb = 0.1,
  maxMoves = 20000,
  verbose = false,
  maxWallMs = Infinity,
}) {
  const rng = mulberry32(seed);
  let grid = new Array(n * n).fill(0);
  spawnTile(grid, n, rng, fourProb);
  spawnTile(grid, n, rng, fourProb);
  let score = 0;
  let moves = 0;
  let maxTile = 0;
  let totalDecisionMs = 0;
  const gameStart = performance.now();
  let worstMoveMs = 0;
  let aborted = false;

  while (moves < maxMoves) {
    if (!anyMovePossible(grid, n)) break;
    if (performance.now() - gameStart > maxWallMs) {
      aborted = true;
      break;
    }
    const t0 = performance.now();
    const dir = suggestMove(grid, n, depth, P);
    const dt = performance.now() - t0;
    totalDecisionMs += dt;
    if (dt > worstMoveMs) worstMoveMs = dt;
    if (dir === null) break;
    const { grid: ng, gained } = slideGrid(grid, n, dir);
    grid = ng;
    score += gained;
    spawnTile(grid, n, rng, fourProb);
    moves++;
    if (verbose && moves % 200 === 0) {
      const empties = grid.filter((v) => v === 0).length;
      console.log(
        `  [seed ${seed}] move ${moves} score=${score} empties=${empties} ` +
          `lastMoveMs=${dt.toFixed(1)} worstMs=${worstMoveMs.toFixed(1)} ` +
          `elapsed=${((performance.now() - gameStart) / 1000).toFixed(1)}s`,
      );
    }
  }
  for (const v of grid) if (v > maxTile) maxTile = v;
  return {
    score,
    moves,
    maxTile,
    aborted,
    worstMoveMs,
    avgDecisionMs: totalDecisionMs / Math.max(moves, 1),
  };
}

export function runBatch({
  games = 10,
  n = 4,
  depth,
  P,
  seedStart = 1,
  fourProb = 0.1,
}) {
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < games; i++) {
    const r = playGame({ n, depth, P, seed: seedStart + i, fourProb });
    results.push(r);
  }
  const totalMs = performance.now() - t0;
  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const min = scores[0];
  const max = scores[scores.length - 1];
  const median = scores[Math.floor(scores.length / 2)];
  const avgDecisionMs =
    results.reduce((a, r) => a + r.avgDecisionMs, 0) / results.length;
  const maxTiles = results.map((r) => r.maxTile);
  return {
    results,
    scores,
    avg,
    min,
    max,
    median,
    totalMs,
    avgDecisionMs,
    maxTiles,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = parseInt(process.argv[2] || "8", 10);
  const depth = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  const maxCells = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;
  const usageArg = process.argv.find((a) => a.startsWith("--usage="));
  const usageName = usageArg ? usageArg.split("=")[1] : null;
  const verbose = process.argv.includes("--verbose");
  const P = usageName
    ? makeParamsForUsage(usageName, maxCells ? { MAX_CELLS: maxCells } : {})
    : makeParams(maxCells ? { MAX_CELLS: maxCells } : {});
  console.log(
    `Running ${games} games, depth=${depth ?? "default(5)"}, usage=${usageName ?? "custom"}, maxCells=${P.MAX_CELLS}...`,
  );
  if (verbose) {
    for (let i = 0; i < games; i++) {
      const r = playGame({
        depth,
        P,
        seed: 1 + i,
        verbose: true,
        maxWallMs: 20000,
      });
      console.log(
        `game ${i}: score=${r.score} maxTile=${r.maxTile} moves=${r.moves} aborted=${r.aborted} worstMoveMs=${r.worstMoveMs.toFixed(1)}`,
      );
    }
  } else {
    const b = runBatch({ games, depth, P });
    console.log("scores:", b.scores);
    console.log("maxTiles:", b.maxTiles);
    console.log(
      `avg=${b.avg.toFixed(0)} min=${b.min} max=${b.max} median=${b.median} ` +
        `avgDecisionMs=${b.avgDecisionMs.toFixed(2)} totalMs=${b.totalMs.toFixed(0)}`,
    );
  }
}
