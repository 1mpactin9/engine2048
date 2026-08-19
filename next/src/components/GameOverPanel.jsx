import { LABELS } from '../lib/powerups';
import { undo as undoIcon } from '../lib/icons';
import './GameOverPanel.css';

export default function GameOverPanel({ mode, score, moves, usedCounts, canUndo, onUndo, onPlayAgain }) {
  const usedList = Object.entries(usedCounts).filter(([, n]) => n > 0);

  return (
    <div className="gameover-panel">
      <h2 className="gameover-title">Game Over</h2>
      <p className="gameover-summary">
        {score} points scored in {moves} moves
      </p>

      {mode !== 'classic' && usedList.length > 0 && (
        <div className="gameover-used">
          <span className="gameover-used-label">Powerups used</span>
          <ul className="gameover-used-list">
            {usedList.map(([id, n]) => (
              <li key={id}>
                {LABELS[id]} × {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="gameover-actions">
        {mode === 'classic' ? (
          <button className="go-btn go-btn--fill" onClick={onPlayAgain}>
            Play Again
          </button>
        ) : canUndo ? (
          <>
            <button className="go-btn go-btn--fill" onClick={onUndo}>
              <span className="go-btn-icon">{undoIcon}</span>
              Undo
            </button>
            <button className="go-btn go-btn--outline" onClick={onPlayAgain}>
              Play Again
            </button>
          </>
        ) : (
          <>
            <button className="go-btn go-btn--fill" onClick={onPlayAgain}>
              Play Again
            </button>
            <button className="go-btn go-btn--outline go-btn--disabled" disabled>
              <span className="go-btn-icon">{undoIcon}</span>
              Undo
            </button>
            <p className="gameover-outof">You&rsquo;re out of undos.</p>
          </>
        )}
      </div>
    </div>
  );
}
