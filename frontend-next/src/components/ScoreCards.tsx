import { useTheme, pickTheme } from '@/theme'

interface ScoreCardsProps {
  score: number
  bestScore: number
}

/** Dynamic min-width by digit count (spec §14.3). */
function scoreMinWidth(value: number): string {
  const digits = String(Math.max(0, value)).length
  const width = 4 + digits * 1.2
  return `${width.toFixed(1)}ch`
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-tan flex min-w-0 grow basis-0 transform-gpu items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-bold sm:h-[52px] sm:flex-col sm:justify-center sm:gap-0 sm:py-0 sm:text-xl ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

export function ScoreCards({ score, bestScore }: ScoreCardsProps) {
  const { uiTheme } = useTheme()
  return (
    <div className="mx-auto grid max-w-96 grid-cols-2 gap-2 px-2 md:grid-cols-1">
      <Card className={pickTheme(uiTheme, { light: 'bg-sand', plus: 'bg-dark-grey', midnight: 'bg-midnight-panel' })}>
        <span>Score</span>
        <span className="tabular-nums" style={{ minWidth: scoreMinWidth(score) }}>
          {score}
        </span>
      </Card>
      <Card
        className={pickTheme(uiTheme, {
          light: 'border-sand border-2',
          plus: 'border-dark-grey border-2',
          midnight: 'border-midnight-panel border-2',
        })}
      >
        <span>Best</span>
        <span className="tabular-nums" style={{ minWidth: scoreMinWidth(bestScore) }}>
          {bestScore}
        </span>
      </Card>
    </div>
  )
}
