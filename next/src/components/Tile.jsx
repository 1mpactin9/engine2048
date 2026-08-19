import { tileStyle, fontSizeFor } from '../lib/tileTheme';
import './Tile.css';

export default function Tile({ tile, activeTool, selected, onClick }) {
  const { value, row, col, isNew, merged } = tile;
  const style = tileStyle(value);
  const isToolable = activeTool === 'teleport' || activeTool === 'swap' || activeTool === 'delete' || activeTool === 'bomb';

  const left = `calc(${col} * (100% / 4) + 0px)`;
  const top = `calc(${row} * (100% / 4) + 0px)`;

  const classes = [
    'tile',
    isNew ? 'tile--spawn' : '',
    merged ? 'tile--merge' : '',
    isToolable ? 'tile--toolable' : '',
    activeTool === 'teleport' ? 'tile--dim' : '',
    activeTool === 'swap' ? 'tile--swap-mode' : '',
    selected ? 'tile--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{
        transform: `translate(${col * 100}%, ${row * 100}%)`,
        '--tile-bg': style.bg,
        '--tile-text': style.text,
        '--font-size': fontSizeFor(value),
      }}
      onClick={isToolable ? onClick : undefined}
    >
      <span className="tile-value">{value}</span>
    </div>
  );
}
