import { useState, useCallback } from 'react';
import { cloneBoard, SIZE } from '../lib/engine';
import { TELEPORT, SWAP, ROTATE, DELETE, BOMB } from '../lib/powerups';

export function usePowerupTools({ board, applyBoard, spendPowerup, powerups, moves }) {
  const [activeTool, setActiveTool] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);

  const cancelTool = useCallback(() => {
    setActiveTool(null);
    setSelectedCell(null);
  }, []);

  const activate = useCallback(
    (id) => {
      if (moves === 0) return; // cannot be used at the very start
      if ((powerups[id] || 0) <= 0) return;

      if (id === ROTATE) {
        rotateRing(1);
        return;
      }

      setActiveTool((cur) => (cur === id ? null : id));
      setSelectedCell(null);
    },
    [moves, powerups]
  );

  const rotateRing = useCallback(
    (dir) => {
      if ((powerups[ROTATE] || 0) <= 0) return;
      const next = cloneBoard(board);
      // collect outer ring coords in order (clockwise)
      const coords = [];
      for (let c = 0; c < SIZE; c++) coords.push([0, c]);
      for (let r = 1; r < SIZE; r++) coords.push([r, SIZE - 1]);
      for (let c = SIZE - 2; c >= 0; c--) coords.push([SIZE - 1, c]);
      for (let r = SIZE - 2; r >= 1; r--) coords.push([r, 0]);

      const values = coords.map(([r, c]) => board[r][c]);
      const n = values.length;
      coords.forEach(([r, c], i) => {
        const srcIdx = dir === 1 ? (i - 1 + n) % n : (i + 1) % n;
        next[r][c] = values[srcIdx];
      });

      spendPowerup(ROTATE);
      applyBoard(next);
      cancelTool();
    },
    [board, powerups, spendPowerup, applyBoard, cancelTool]
  );

  const handleCellClick = useCallback(
    (row, col) => {
      if (!activeTool) return;
      const tile = board[row][col];

      if (activeTool === TELEPORT) {
        if (tile) return; // must target empty cell
        if (!selectedCell) return; // teleport chooses a tile first via tile click; see handleTileClick
        const next = cloneBoard(board);
        next[row][col] = next[selectedCell.row][selectedCell.col];
        next[selectedCell.row][selectedCell.col] = null;
        spendPowerup(TELEPORT);
        applyBoard(next);
        cancelTool();
        return;
      }

      if (activeTool === SWAP) {
        if (!tile) return;
        if (!selectedCell) {
          setSelectedCell({ row, col });
          return;
        }
        if (selectedCell.row === row && selectedCell.col === col) {
          setSelectedCell(null);
          return;
        }
        const next = cloneBoard(board);
        const a = next[selectedCell.row][selectedCell.col];
        const b = next[row][col];
        next[selectedCell.row][selectedCell.col] = b;
        next[row][col] = a;
        spendPowerup(SWAP);
        applyBoard(next);
        cancelTool();
        return;
      }

      if (activeTool === DELETE) {
        if (!tile) return;
        const value = tile.value;
        let matches = 0;
        for (let r = 0; r < SIZE; r++)
          for (let c = 0; c < SIZE; c++) if (board[r][c] && board[r][c].value === value) matches++;
        const next = cloneBoard(board);
        for (let r = 0; r < SIZE; r++)
          for (let c = 0; c < SIZE; c++) if (next[r][c] && next[r][c].value === value) next[r][c] = null;
        spendPowerup(DELETE, matches > 1 ? 2 : 1);
        applyBoard(next);
        cancelTool();
        return;
      }

      if (activeTool === BOMB) {
        const next = cloneBoard(board);
        for (let r = row - 1; r <= row + 1; r++) {
          for (let c = col - 1; c <= col + 1; c++) {
            if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) next[r][c] = null;
          }
        }
        spendPowerup(BOMB);
        applyBoard(next);
        cancelTool();
        return;
      }
    },
    [activeTool, board, selectedCell, spendPowerup, applyBoard, cancelTool]
  );

  // For teleport, the first click must land on a filled tile (source), handled via cell click since
  // clicking a tile is equivalent to clicking its cell here.
  const handleTeleportSource = useCallback(
    (row, col) => {
      const tile = board[row][col];
      if (activeTool === TELEPORT && tile && !selectedCell) {
        setSelectedCell({ row, col });
      }
    },
    [activeTool, board, selectedCell]
  );

  const onCellClick = useCallback(
    (row, col) => {
      if (activeTool === TELEPORT) {
        const tile = board[row][col];
        if (tile && !selectedCell) {
          handleTeleportSource(row, col);
          return;
        }
      }
      handleCellClick(row, col);
    },
    [activeTool, board, selectedCell, handleTeleportSource, handleCellClick]
  );

  return { activeTool, selectedCell, onCellClick, cancelTool, activate };
}
