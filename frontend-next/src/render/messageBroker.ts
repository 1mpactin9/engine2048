/**
 * MessageBroker (spec §1.1): dedicated RPC + event channel between the
 * main thread and the rendering worker. Supports `call`/`response`,
 * `addListener`, `removeListener`, and `emit`.
 */

export type BrokerPort = {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (ev: MessageEvent) => void): void
}

interface CallMsg {
  kind: 'call'
  id: number
  method: string
  args: unknown[]
}
interface ResponseMsg {
  kind: 'response'
  id: number
  result?: unknown
  error?: string
}
interface EventMsg {
  kind: 'event'
  name: string
  args: unknown[]
}
interface ListenMsg {
  kind: 'listen' | 'unlisten'
  name: string
}
export type BrokerMessage = CallMsg | ResponseMsg | EventMsg | ListenMsg

/** Gather ImageBitmap / OffscreenCanvas args so they transfer without detaching on the sending side. */
function collectTransferables(message: BrokerMessage): Transferable[] {
  const out: Transferable[] = []
  const visit = (v: unknown) => {
    if (v === null || typeof v !== 'object') return
    if (v instanceof ImageBitmap || (typeof OffscreenCanvas !== 'undefined' && v instanceof OffscreenCanvas)) {
      out.push(v as Transferable)
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item)
    } else {
      for (const item of Object.values(v as Record<string, unknown>)) visit(item)
    }
  }
  if (message.kind === 'call') visit(message.args)
  return out
}

export class MessageBroker {
  private port: BrokerPort
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  /** Registered on the receiving side; call() dispatches into these. */
  private methods = new Map<string, (...args: any[]) => unknown>()

  constructor(port: BrokerPort) {
    this.port = port
    port.addEventListener('message', (ev: MessageEvent) => this.handle(ev.data as BrokerMessage))
  }

  private send(message: BrokerMessage, transfer?: Transferable[]) {
    const auto = collectTransferables(message)
    this.port.postMessage(message, transfer ?? (auto.length ? auto : undefined))
  }

  private handle(msg: BrokerMessage) {
    switch (msg.kind) {
      case 'call': {
        const method = this.methods.get(msg.method)
        if (!method) {
          this.send({ kind: 'response', id: msg.id, error: `Unknown method: ${msg.method}` })
          return
        }
        Promise.resolve()
          .then(() => method(...msg.args))
          .then((result) => this.send({ kind: 'response', id: msg.id, result }))
          .catch((err: Error) => this.send({ kind: 'response', id: msg.id, error: String(err) }))
        break
      }
      case 'response': {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error))
        else p.resolve(msg.result)
        break
      }
      case 'event': {
        const set = this.listeners.get(msg.name)
        if (set) for (const fn of set) fn(...msg.args)
        break
      }
      case 'listen':
        if (!this.listeners.has(msg.name)) this.listeners.set(msg.name, new Set())
        this.listeners.get(msg.name)!.add(() => {})
        // The actual callback wiring is local-only; remote listeners just
        // ensure the peer keeps emitting the event.
        break
      case 'unlisten': {
        const set = this.listeners.get(msg.name)
        if (set) set.clear()
        break
      }
    }
  }

  /** Invoke a method exposed by the peer broker. */
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.send({ kind: 'call', id, method, args })
    })
  }

  /** Expose a method to the peer. */
  expose(method: string, fn: (...args: any[]) => unknown) {
    this.methods.set(method, fn)
  }

  /** Fire an event at the peer's listeners. */
  emit(name: string, ...args: unknown[]) {
    this.send({ kind: 'event', name, args })
  }

  addListener(name: string, fn: (...args: unknown[]) => void) {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set())
      this.send({ kind: 'listen', name })
    }
    this.listeners.get(name)!.add(fn)
  }

  removeListener(name: string, fn: (...args: unknown[]) => void) {
    this.listeners.get(name)?.delete(fn)
  }
}
