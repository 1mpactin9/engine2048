import { useState } from 'react';
import { LABELS, CAP, UNDO, TELEPORT, SWAP, ROTATE, DELETE, BOMB } from '../lib/powerups';
import { undo, teleport, swap, rotate, deleteNum, bomb } from '../lib/icons';
import './PowerupsBar.css';

const ICON_MAP = {
  [UNDO]: undo,
  [TELEPORT]: teleport,
  [SWAP]: swap,
  [ROTATE]: rotate,
  [DELETE]: deleteNum,
  [BOMB]: bomb,
};

export default function PowerupsBar({ mode, list, powerups, activeTool, onActivate }) {
  const [hovered, setHovered] = useState(null);

  if (mode === 'classic') return null;

  return (
    <div className="powerups-bar">
      {list.map((id) => {
        const count = powerups[id] || 0;
        const disabled = count <= 0;
        const isActive = activeTool === id;
        return (
          <div
            className="powerup-wrap"
            key={id}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              className={`powerup-btn ${disabled ? 'is-disabled' : ''} ${isActive ? 'is-active' : ''}`}
              disabled={disabled}
              onClick={() => onActivate(id)}
              aria-label={LABELS[id]}
            >
              <span className="powerup-icon">{ICON_MAP[id]}</span>
              <span className="powerup-indicators">
                {Array.from({ length: CAP }).map((_, i) => (
                  <span
                    key={i}
                    className={`indicator-dash ${i < count ? 'is-filled' : ''} ${disabled ? 'is-disabled' : ''}`}
                  />
                ))}
              </span>
            </button>
            {hovered === id && (
              <div className="powerup-tooltip">
                {LABELS[id]}
                <span className="tooltip-count">
                  {count}/{CAP}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
