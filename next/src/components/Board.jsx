import { flatten, SIZE } from '../lib/engine';
import Tile from './Tile';
import './Board.css';

export default function Board({ board, dark, activeTool, onCellClick, selectedCell, onTouchStart, onTouchEnd }) {
  const tiles = flatten(board);
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) cells.push({ r, c });
  }

  return (
    <div
      className={`board-outer ${dark ? 'board-outer--dark' : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="board-inner">
        <div className="board-grid">
          {cells.map(({ r, c }) => (
            <div
              key={`${r}-${c}`}
              className={`board-cell ${activeTool ? 'board-cell--tool' : ''}`}
              onClick={() => onCellClick && onCellClick(r, c)}
            />
          ))}
        </div>
        <div className="tile-layer">
          {tiles.map((t) => (
            <Tile
              key={t.id}
              tile={t}
              activeTool={activeTool}
              selected={selectedCell && selectedCell.row === t.row && selectedCell.col === t.col}
              onClick={() => onCellClick && onCellClick(t.row, t.col)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
