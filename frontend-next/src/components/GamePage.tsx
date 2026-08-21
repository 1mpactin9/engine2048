import type { Mode } from '@/engine/types'
import { useGame } from '@/hooks/useGame'
import { useTheme, pickTheme } from '@/theme'
import { Header } from './Header'
import { ScoreCards } from './ScoreCards'
import { PowerupBar } from './PowerupBar'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'

/** Curved arrow for the rotate powerup (spec §37). */
function RotateArrow({ onClick, direction }: { onClick: () => void; direction: 'ccw' | 'cw' }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-1/2 -translate-y-1/2 transition-transform duration-200 hover:scale-110"
      style={{ [direction === 'cw' ? 'right' : 'left']: '-56px' } as React.CSSProperties}
      aria-label={direction === 'cw' ? 'Rotate clockwise' : 'Rotate counter-clockwise'}
    >
      <svg
        className="animate-float-y text-white"
        width="60"
        height="60"
        viewBox="0 0 32 32"
        fill="none"
        style={{ transform: direction === 'cw' ? 'scaleX(-1)' : undefined }}
      >
        <path
          d="M27 16A11 11 0 1 1 16 5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M27 4v7h-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </button>
  )
}

export function GamePage({ mode }: { mode: Mode }) {
  const game = useGame(mode as 'standard' | 'classic' | 'plus')
  const { uiTheme } = useTheme()
  const { state } = game
  const tutorialDone = typeof localStorage !== 'undefined' && localStorage.getItem('tutorialDone') === 'true'

  const hasRescue =
    (state.powerups.undo?.usesRemaining ?? 0) > 0 ||
    (mode === 'plus' && (state.powerups.bomb?.usesRemaining ?? 0) > 0)

  return (
    <div className={pickTheme(uiTheme, {
      light: 'bg-off-white text-brown flex min-h-[100svh] w-full flex-col px-4 pt-6 pb-3 md:px-8 md:pt-0 md:pb-8 pwa:pb-10 short:pt-[0.375rem]',
      plus: 'bg-near-black text-sand flex min-h-[100svh] w-full flex-col px-4 pt-6 pb-3 md:px-8 md:pt-0 md:pb-8 pwa:pb-10 short:pt-[0.375rem]',
      midnight: 'bg-midnight-void text-midnight-sand flex min-h-[100svh] w-full flex-col px-4 pt-6 pb-3 md:px-8 md:pt-0 md:pb-8 pwa:pb-10 short:pt-[0.375rem]',
    })}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <Header mode={mode} onNewGame={() => game.setShowNewGame(true)} tutorialDone={tutorialDone} />
        <ScoreCards score={state.score} bestScore={game.bestScore} />

        <div className="relative flex items-center justify-center">
          {game.selection?.powerup === 'rotate' && (
            <>
              <RotateArrow direction="ccw" onClick={() => game.rotate(false)} />
              <RotateArrow direction="cw" onClick={() => game.rotate(true)} />
            </>
          )}
          <div className="relative aspect-square w-full max-w-[min(100%,62vh)]">
            <canvas ref={game.canvasRef} className="absolute inset-0 h-full w-full touch-none" />
          </div>
        </div>

        {game.prompt && (
          <p className="text-center text-sm font-semibold opacity-80">{game.prompt}</p>
        )}

        <PowerupBar
          mode={mode}
          inventory={state.powerups}
          selecting={game.selectingPowerup}
          disabled={game.busy}
          onSelect={game.beginSelecting}
          onCancel={game.cancelSelection}
        />
      </div>

      {/* Game Over modal (§27, §48) */}
      {game.showGameOver && (
        <Modal title="Game Over">
          <p>
            {state.score} points scored in {state.moveCount} moves.
          </p>
          <p className="opacity-70">
            {state.powerupsUsed > 0 ? `${state.powerupsUsed} powerups used:` : 'No powerups used!'}
          </p>
          {hasRescue ? (
            <PrimaryButton onClick={() => void game.undo()}>Undo</PrimaryButton>
          ) : (
            <PrimaryButton onClick={game.newGame}>Try Again</PrimaryButton>
          )}
        </Modal>
      )}

      {/* Win modal (§26, §49) */}
      {game.showWin && (
        <Modal title="You Win">
          <p>
            {state.score} points scored in {state.moveCount} moves.
          </p>
          <SecondaryButton onClick={game.newGame}>Start Over</SecondaryButton>
          <PrimaryButton onClick={game.keepGoing}>Keep Going</PrimaryButton>
        </Modal>
      )}

      {/* New game confirmation (§50) */}
      {game.showNewGame && (
        <Modal title="New Game">
          <p>Are you sure you want to start a new game? All progress will be lost.</p>
          <SecondaryButton onClick={() => game.setShowNewGame(false)}>Cancel</SecondaryButton>
          <PrimaryButton destructive onClick={game.newGame}>
            Start New Game
          </PrimaryButton>
        </Modal>
      )}
    </div>
  )
}
