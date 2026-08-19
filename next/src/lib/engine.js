// Pure game logic for 2048. Board is 4x4. Tiles are objects with stable ids
// so React can animate them across positions.
let idCounter = 1;
const nextId = () => idCounter++;

export const SIZE = 4;

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function emptyCells(board) {
  const cells = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (!board[r][c]) cells.push([r, c]);
  return cells;
}

export function spawnTile(board, forceValue) {
  const cells = emptyCells(board);
  if (cells.length === 0) return board;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  const value = forceValue || (Math.random() < 0.9 ? 2 : 4);
  const next = cloneBoard(board);
  next[r][c] = { id: nextId(), value, isNew: true };
  return next;
}

export function newBoard() {
  let board = emptyBoard();
  board = spawnTile(board);
  board = spawnTile(board);
  return board;
}

// Returns rotated view coordinates so all 4 directions reuse one algorithm.
// dir: 'left' | 'right' | 'up' | 'down'
function getLine(board, dir, index) {
  const line = [];
  for (let i = 0; i < SIZE; i++) {
    if (dir === 'left') line.push(board[index][i]);
    else if (dir === 'right') line.push(board[index][SIZE - 1 - i]);
    else if (dir === 'up') line.push(board[i][index]);
    else if (dir === 'down') line.push(board[SIZE - 1 - i][index]);
  }
  return line;
}

function setLine(board, dir, index, line) {
  for (let i = 0; i < SIZE; i++) {
    if (dir === 'left') board[index][i] = line[i];
    else if (dir === 'right') board[index][SIZE - 1 - i] = line[i];
    else if (dir === 'up') board[i][index] = line[i];
    else if (dir === 'down') board[SIZE - 1 - i][index] = line[i];
  }
}

// Slides + merges one line toward index 0. Returns { line, moved, gained, merges }
function collapseLine(line) {
  const tiles = line.filter(Boolean).map((t) => ({ ...t, isNew: false, merged: false }));
  const result = [];
  let gained = 0;
  const merges = [];
  for (let i = 0; i < tiles.length; i++) {
    const cur = tiles[i];
    const next = tiles[i + 1];
    if (next && next.value === cur.value && !cur.merged) {
      const mergedTile = {
        id: nextId(),
        value: cur.value * 2,
        merged: true,
        fromIds: [cur.id, next.id],
      };
      result.push(mergedTile);
      gained += mergedTile.value;
      merges.push(mergedTile.value);
      i++; // skip consumed tile
    } else {
      result.push(cur);
    }
  }
  while (result.length < SIZE) result.push(null);

  const moved = line.some((cell, i) => {
    const cell2 = result[i];
    if (!cell && !cell2) return false;
    if (!cell || !cell2) return true;
    return cell.id !== cell2.id;
  });

  return { line: result, moved, gained, merges };
}

export function move(board, dir) {
  const next = cloneBoard(board);
  let moved = false;
  let gained = 0;
  let merges = [];

  for (let i = 0; i < SIZE; i++) {
    const line = getLine(board, dir, i);
    const res = collapseLine(line);
    if (res.moved) moved = true;
    gained += res.gained;
    merges = merges.concat(res.merges);
    setLine(next, dir, i, res.line);
  }

  return { board: next, moved, gained, merges };
}

export function canMove(board) {
  if (emptyCells(board).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c].value;
      if (c < SIZE - 1 && board[r][c + 1].value === v) return true;
      if (r < SIZE - 1 && board[r + 1][c].value === v) return true;
    }
  }
  return false;
}

export function highestTile(board) {
  let max = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (board[r][c] && board[r][c].value > max) max = board[r][c].value;
  return max;
}

export function flatten(board) {
  const tiles = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (board[r][c]) tiles.push({ ...board[r][c], row: r, col: c });
  return tiles;
}
