import { useCallback, useEffect, useRef, useState } from 'react';
import { newBoard, move as engineMove, spawnTile, canMove, highestTile, cloneBoard } from '../lib/engine';
import { MODE_POWERUPS, STARTING, UNLOCKS, CAP, UNDO } from '../lib/powerups';

const BEST_KEY_PREFIX = 'best-'; // kept in-memory only (no localStorage per artifact rules)

function initialPowerups(mode) {
  const list = MODE_POWERUPS[mode] || [];
  const starting = STARTING[mode] || {};
  const out = {};
  list.forEach((id) => {
    out[id] = starting[id] || 0;
  });
  return out;
}

export function useGame(mode) {
  const [board, setBoard] = useState(() => newBoard());
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState({ classic: 0, standard: 0, plus: 0 });
  const [moves, setMoves] = useState(0);
  const [powerups, setPowerups] = useState(() => initialPowerups(mode));
  const [usedCounts, setUsedCounts] = useState({});
  const [reachedThresholds, setReachedThresholds] = useState(() => new Set());
  const [isGameOver, setIsGameOver] = useState(false);
  const [undoUsedOnce, setUndoUsedOnce] = useState(false);
  const [mergedValues, setMergedValues] = useState([]);
  const historyRef = useRef([]); // stack of {board, score, moves, powerups}
  const modeRef = useRef(mode);

  const best = bestScores[mode] || 0;

  const resetForMode = useCallback((newMode) => {
    modeRef.current = newMode;
    setBoard(newBoard());
    setScore(0);
    setMoves(0);
    setPowerups(initialPowerups(newMode));
    setUsedCounts({});
    setReachedThresholds(new Set());
    setIsGameOver(false);
    setUndoUsedOnce(false);
    setMergedValues([]);
    historyRef.current = [];
  }, []);

  useEffect(() => {
    resetForMode(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const checkUnlocks = useCallback(
    (b) => {
      const unlocks = UNLOCKS[mode];
      if (!unlocks) return;
      const top = highestTile(b);
      setReachedThresholds((prevSet) => {
        const nextSet = new Set(prevSet);
        let gained = {};
        unlocks.forEach(({ value, id }) => {
          const key = `${value}-${id}`;
          if (top >= value && !nextSet.has(key)) {
            nextSet.add(key);
            gained[id] = (gained[id] || 0) + 1;
          }
        });
        if (Object.keys(gained).length) {
          setPowerups((prev) => {
            const next = { ...prev };
            Object.entries(gained).forEach(([id, amt]) => {
              next[id] = Math.min(CAP, (next[id] || 0) + amt);
            });
            return next;
          });
        }
        return nextSet;
      });
    },
    [mode]
  );

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      board: cloneBoard(board),
      score,
      moves,
      powerups: { ...powerups },
    });
    if (historyRef.current.length > 30) historyRef.current.shift();
  }, [board, score, moves, powerups]);

  const doMove = useCallback(
    (dir) => {
      if (isGameOver) return;
      const res = engineMove(board, dir);
      if (!res.moved) return;

      pushHistory();

      let nextBoard = spawnTile(res.board);
      setBoard(nextBoard);
      setScore((s) => {
        const ns = s + res.gained;
        setBestScores((bs) => (ns > (bs[mode] || 0) ? { ...bs, [mode]: ns } : bs));
        return ns;
      });
      setMoves((m) => m + 1);
      if (res.merges.length) setMergedValues(res.merges);

      checkUnlocks(nextBoard);

      if (!canMove(nextBoard)) {
        setIsGameOver(true);
      }
    },
    [board, isGameOver, mode, pushHistory, checkUnlocks]
  );

  const canUndo = powerups[UNDO] > 0 && !undoUsedOnce && historyRef.current.length > 0;

  const useUndo = useCallback(() => {
    if (!canUndo) return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    setBoard(prev.board);
    setScore(prev.score);
    setMoves(prev.moves);
    setPowerups((p) => ({ ...p, [UNDO]: p[UNDO] - 1 }));
    setUsedCounts((u) => ({ ...u, undo: (u.undo || 0) + 1 }));
    setUndoUsedOnce(true);
    setIsGameOver(false);
  }, [canUndo]);

  const spendPowerup = useCallback((id, amount = 1) => {
    setPowerups((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) - amount) }));
    setUsedCounts((u) => ({ ...u, [id]: (u[id] || 0) + amount }));
  }, []);

  const applyBoard = useCallback((newBoardState) => {
    pushHistory();
    setBoard(newBoardState);
    if (!canMove(newBoardState)) setIsGameOver(true);
  }, [pushHistory]);

  return {
    board,
    setBoard,
    score,
    best,
    moves,
    powerups,
    usedCounts,
    isGameOver,
    setIsGameOver,
    canUndo,
    useUndo,
    spendPowerup,
    applyBoard,
    doMove,
    resetForMode,
    mergedValues,
    clearMerges: () => setMergedValues([]),
  };
}
