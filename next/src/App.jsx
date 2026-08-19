// src/App.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import {
  initializeGrid,
  spawnTile,
  slideLeft,
  slideRight,
  slideUp,
  slideDown,
  isGameOver,
} from "./gameLogic";

const App = () => {
  const [grid, setGrid] = useState(initializeGrid);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(
    parseInt(localStorage.getItem("2048-best")) || 0
  );
  const [gameOver, setGameOver] = useState(false);
  const touchStartRef = useRef(null);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem("2048-best", score.toString());
    }
  }, [score, bestScore]);

  const handleMove = useCallback(
    (direction) => {
      if (gameOver) return;

      let result;
      switch (direction) {
        case "UP":
          result = slideUp(grid);
          break;
        case "DOWN":
          result = slideDown(grid);
          break;
        case "LEFT":
          result = slideLeft(grid);
          break;
        case "RIGHT":
          result = slideRight(grid);
          break;
        default:
          return;
      }

      if (result.changed) {
        const newGrid = spawnTile(result.grid);
        setGrid(newGrid);
        setScore((s) => s + result.score);
        if (isGameOver(newGrid)) setGameOver(true);
      }
    },
    [grid, gameOver]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case "ArrowUp":
          handleMove("UP");
          break;
        case "ArrowDown":
          handleMove("DOWN");
          break;
        case "ArrowLeft":
          handleMove("LEFT");
          break;
        case "ArrowRight":
          handleMove("RIGHT");
          break;
        default:
          return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleMove]);

  const handleTouchStart = (e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 30) handleMove(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      if (Math.abs(dy) > 30) handleMove(dy > 0 ? "DOWN" : "UP");
    }
    touchStartRef.current = null;
  };

  const restartGame = () => {
    setGrid(initializeGrid());
    setScore(0);
    setGameOver(false);
  };

  const getTileColor = (val) => {
    if (val <= 2048 && val > 0) return `bg-tile-${val}`;
    if (val > 2048) return "bg-dark-grey";
    return "bg-leather/30";
  };

  const getTextColor = (val) => {
    return val <= 4 ? "text-brown" : "text-white";
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen w-screen px-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="w-full max-w-[450px]">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-6xl font-black text-brown">2048</h1>
          <div className="flex gap-2">
            <div className="bg-sand text-center px-6 py-2 rounded-md">
              <div className="text-tan text-sm font-bold uppercase">
                Score
              </div>
              <div className="text-brown text-xl font-bold leading-none">
                {score}
              </div>
            </div>
            <div className="bg-leather text-center px-6 py-2 rounded-md">
              <div className="text-sand text-sm font-bold uppercase">
                Best
              </div>
              <div className="text-white text-xl font-bold leading-none">
                {bestScore}
              </div>
            </div>
          </div>
        </header>

        {/* Subheader */}
        <div className="flex justify-between items-center mb-8">
          <p className="text-lg text-brown max-w-[200px] leading-tight">
            Join the numbers and get to the{" "}
            <strong>2048 tile!</strong>
          </p>
          <button
            onClick={restartGame}
            className="bg-tan hover:bg-leather text-white font-bold py-3 px-6 rounded-md shadow-button transition-colors"
          >
            New Game
          </button>
        </div>

        {/* Game Board */}
        <div className="relative bg-leather p-3 rounded-lg w-full aspect-square">
          <div className="grid grid-cols-4 grid-rows-4 gap-3 w-full h-full">
            {grid.map((row, r) =>
              row.map((val, c) => (
                <div
                  key={`${r}-${c}`}
                  className={`flex items-center justify-center rounded-md text-3xl md:text-4xl font-black
                    ${val === 0 ? "bg-black/10" : getTileColor(val)}
                    ${getTextColor(val)}
                    ${val > 0 ? "animate-pop" : ""}
                  `}
                >
                  {val > 0 ? val : ""}
                </div>
              ))
            )}
          </div>

          {/* Game Over Overlay */}
          {gameOver && (
            <div className="absolute inset-0 bg-sand/80 rounded-lg flex flex-col items-center justify-center animate-pop z-10">
              <h2 className="text-5xl font-black text-brown mb-4">
                Game Over!
              </h2>
              <button
                onClick={restartGame}
                className="bg-brown hover:bg-dark-grey text-white font-bold py-3 px-6 rounded-md shadow-button transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="mt-8 text-sm text-tan text-center">
          Use your <strong>arrow keys</strong> to move the tiles. Tiles with
          the same number merge into one when they touch. Add them up to reach{" "}
          <strong>2048!</strong>
        </p>
      </div>
    </div>
  );
};

export default App;
