import type { Route } from '@/router'
import { navigate } from '@/router'
import { useTheme, pickTheme } from '@/theme'

function Wrapper({ children }: { children: React.ReactNode }) {
  const { uiTheme } = useTheme()
  return (
    <div
      className={pickTheme(uiTheme, {
        light: 'bg-off-white text-brown min-h-[100svh] w-full',
        plus: 'bg-near-black text-sand min-h-[100svh] w-full',
        midnight: 'bg-midnight-void text-midnight-sand min-h-[100svh] w-full',
      })}
    >
      <div className="mx-auto w-screen max-w-screen-md px-4 py-6 sm:px-8">
        <button onClick={() => navigate('/')} className="text-64-red text-3xl font-bold">
          2048
        </button>
        {children}
      </div>
    </div>
  )
}

function MidnightToggle() {
  const { midnight, setMidnight } = useTheme()
  return (
    <div className="mt-8 flex items-center justify-between rounded-xl border border-current/20 p-4">
      <div>
        <h2 className="text-lg font-bold">Midnight Theme</h2>
        <p className="text-sm opacity-70">A granite, near-black theme for the whole app.</p>
      </div>
      <button
        onClick={() => setMidnight(!midnight)}
        role="switch"
        aria-checked={midnight}
        className={`relative h-7 w-12 rounded-full transition-colors ${midnight ? 'bg-64-red' : 'bg-gray-400/50'}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
            midnight ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export function StaticPage({ route }: { route: Route }) {
  return (
    <Wrapper>
      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed">
        {route === '/about' && (
          <>
            <h1 className="text-2xl font-bold">About 2048</h1>
            <p>
              2048 is a sliding tile puzzle created by Gabriele Cirulli in 2014. This version adds powerups,
              a Plus mode, and a Classic mode that preserves the original rules.
            </p>
            <p>Credits: original 2048 by Gabriele Cirulli. This reimplementation and its powerup system are our own.</p>
            <MidnightToggle />
          </>
        )}

        {route === '/privacy-policy' && (
          <>
            <h1 className="text-2xl font-bold">Privacy Policy</h1>
            <p>
              This game does not require an account. Game progress is stored locally in your browser and never
              leaves your device.
            </p>
            <p>
              Advertisements may be served by third parties such as MediaVine. These providers may use cookies and
              similar technologies to deliver and measure ads. You can opt out of personalized advertising through
              your browser or device settings.
            </p>
          </>
        )}

        {route === '/troubleshooting' && (
          <>
            <h1 className="text-2xl font-bold">Troubleshooting</h1>
            <h2 className="mt-2 text-lg font-semibold">Slow or choppy rendering</h2>
            <p>
              This game uses hardware acceleration. In Chrome, ensure "Use hardware acceleration when available" is
              enabled in Settings &gt; System. In Safari, disable "Reduce motion" if animations appear frozen.
            </p>
            <h2 className="mt-2 text-lg font-semibold">Progress not saving</h2>
            <p>
              Progress is saved to your browser's local storage. Clearing site data, private browsing, or browser
              policies that block storage will prevent saving.
            </p>
          </>
        )}
      </div>
    </Wrapper>
  )
}
