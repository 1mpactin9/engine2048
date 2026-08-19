// src/gameLogic.js

export const getEmptyCoordinates = (grid) => {
  const empty = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) empty.push({ r, c });
    }
  }
  return empty;
};

export const spawnTile = (grid) => {
  const empty = getEmptyCoordinates(grid);
  if (empty.length === 0) return grid;
  const newGrid = grid.map((row) => [...row]);
  const { r, c } = empty[Math.floor(Math.random() * empty.length)];
  newGrid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return newGrid;
};

export const initializeGrid = () => {
  let grid = Array(4).fill(null).map(() => Array(4).fill(0));
  grid = spawnTile(grid);
  grid = spawnTile(grid);
  return grid;
};

export const slideLeft = (grid) => {
  let score = 0;
  let changed = false;
  const newGrid = grid.map((row) => [...row]);

  for (let r = 0; r < 4; r++) {
    let row = newGrid[r].filter((val) => val !== 0);
    for (let i = 0; i < row.length - 1; i++) {
      if (row[i] !== 0 && row[i] === row[i + 1]) {
        row[i] *= 2;
        score += row[i];
        row[i + 1] = 0;
      }
    }
    row = row.filter((val) => val !== 0);
    while (row.length < 4) row.push(0);
    if (newGrid[r].join(",") !== row.join(",")) changed = true;
    newGrid[r] = row;
  }
  return { grid: newGrid, score, changed };
};

const rotateLeft = (grid) => {
  const newGrid = Array(4).fill(null).map(() => Array(4).fill(0));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      newGrid[3 - c][r] = grid[r][c];
    }
  }
  return newGrid;
};

const rotateRight = (grid) => {
  const newGrid = Array(4).fill(null).map(() => Array(4).fill(0));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      newGrid[c][3 - r] = grid[r][c];
    }
  }
  return newGrid;
};

export const slideRight = (grid) => {
  let rotated = rotateLeft(rotateLeft(grid));
  let result = slideLeft(rotated);
  result.grid = rotateRight(rotateRight(result.grid));
  return result;
};

export const slideUp = (grid) => {
  let rotated = rotateLeft(grid);
  let result = slideLeft(rotated);
  result.grid = rotateRight(result.grid);
  return result;
};

export const slideDown = (grid) => {
  let rotated = rotateRight(grid);
  let result = slideLeft(rotated);
  result.grid = rotateLeft(result.grid);
  return result;
};

export const isGameOver = (grid) => {
  if (getEmptyCoordinates(grid).length > 0) return false;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (r < 3 && grid[r][c] === grid[r + 1][c]) return false;
      if (c < 3 && grid[r][c] === grid[r][c + 1]) return false;
    }
  }
  return true;
};
