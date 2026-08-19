import { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import Board from './components/Board';
import PowerupsBar from './components/PowerupsBar';
import NewGameModal from './components/NewGameModal';
import GameOverPanel from './components/GameOverPanel';
import { useGame } from './hooks/useGame';
import { usePowerupTools } from './hooks/usePowerupTools';
import { MODE_POWERUPS, TELEPORT } from './lib/powerups';
import { canMove } from './lib/engine';
import './styles/global.css';
import './App.css';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 560);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 560);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

export default function App() {
  const [mode, setMode] = useState('classic');
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const isMobile = useIsMobile();

  const game = useGame(mode);
  const {
    board,
    score,
    best,
    moves,
    powerups,
    usedCounts,
    isGameOver,
    canUndo,
    useUndo,
    spendPowerup,
    applyBoard,
    doMove,
    resetForMode,
  } = game;

  const tools = usePowerupTools({ board, applyBoard, spendPowerup, powerups, moves });

  useEffect(() => {
    function onKey(e) {
      const map = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        a: 'left',
        d: 'right',
        w: 'up',
        s: 'down',
      };
      const dir = map[e.key];
      if (!dir) return;
      if (tools.activeTool) return;
      e.preventDefault();
      doMove(dir);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove, tools.activeTool]);

  const touchRef = useRef(null);
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onTouchEnd = useCallback(
    (e) => {
      if (!touchRef.current || tools.activeTool) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 24) return;
      if (absX > absY) doMove(dx > 0 ? 'right' : 'left');
      else doMove(dy > 0 ? 'down' : 'up');
      touchRef.current = null;
    },
    [doMove, tools.activeTool]
  );

  const requestNewGame = () => {
    if (!isGameOver && canMove(board) && moves > 0) {
      setShowNewGameModal(true);
    } else {
      resetForMode(mode);
    }
  };

  const confirmNewGame = () => {
    resetForMode(mode);
    setShowNewGameModal(false);
  };

  const list = MODE_POWERUPS[mode] || [];
  const dark = mode === 'plus';

  return (
    <div className="app-root">
      <Header
        mode={mode}
        setMode={(m) => setMode(m)}
        score={score}
        best={best}
        onNewGame={requestNewGame}
        isMobile={isMobile}
      />

      <main className={`app-main ${mode === 'classic' ? 'app-main--classic' : ''}`}>
        <Board
          board={board}
          dark={dark}
          activeTool={tools.activeTool}
          selectedCell={tools.activeTool !== TELEPORT ? tools.selectedCell : null}
          onCellClick={tools.onCellClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />

        {isGameOver && (
          <GameOverPanel
            mode={mode}
            score={score}
            moves={moves}
            usedCounts={usedCounts}
            canUndo={canUndo}
            onUndo={useUndo}
            onPlayAgain={() => resetForMode(mode)}
          />
        )}

        {!isGameOver && (
          <PowerupsBar
            mode={mode}
            list={list}
            powerups={powerups}
            activeTool={tools.activeTool}
            onActivate={tools.activate}
          />
        )}
      </main>

      {showNewGameModal && (
        <NewGameModal onConfirm={confirmNewGame} onCancel={() => setShowNewGameModal(false)} />
      )}
    </div>
  );
}
