import { useState, useRef, useEffect } from 'react';
import ModeDropdown from './ModeDropdown';
import './Header.css';

const PLUS_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24">
    <path fill="currentColor" d="M3 16h18v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zm0-2-.621-7.452a.75.75 0 0 1 1.163-.686l3.756 2.503a.75.75 0 0 0 1.006-.16L11.41 4.25a.75.75 0 0 1 1.18 0l3.106 3.954a.75.75 0 0 0 1.006.16l3.756-2.503a.75.75 0 0 1 1.163.686L21 14z" />
  </svg>
);

export default function Header({ mode, setMode, score, best, onNewGame, isMobile }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <header className="app-header">
      <div className="header-left" ref={wrapRef}>
        <button
          className="hamburger-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="title-block">
          <span className="title-2048">2048</span>
          {mode === 'classic' && <span className="mode-tag">Classic</span>}
        </div>

        {menuOpen && (
          <ModeDropdown
            mode={mode}
            onSelect={(m) => {
              setMode(m);
              setMenuOpen(false);
            }}
          />
        )}
      </div>

      <div className="header-center">
        <div className="score-box">
          <span className="score-label">Score</span>
          <span className="score-value">{score}</span>
        </div>
        <div className="score-box score-box--best">
          <span className="score-label">Best</span>
          <span className="score-value">{best}</span>
        </div>
      </div>

      <div className="header-right">
        {isMobile ? (
          <button className="new-game-fab" aria-label="New game" onClick={onNewGame}>
            {PLUS_ICON}
          </button>
        ) : (
          <button className="new-game-btn" onClick={onNewGame}>
            New Game
          </button>
        )}
      </div>
    </header>
  );
}
