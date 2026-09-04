import { useEffect, useRef, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { CURSOR_TTL_MS, staleClientIds, type Presence } from '@canvas/canvas-core'

export interface RemoteCursor {
  clientId: number
  name: string
  color: string
  x: number
  y: number
}

/** Cadencia de reevaluación del TTL. No hace falta más fino: el umbral es de 30 s. */
const SWEEP_INTERVAL_MS = 5_000

export function useRemotePresence(provider: HocuspocusProvider | null): RemoteCursor[] {
  const [cursors, setCursors] = useState<RemoteCursor[]>([])
  // Timestamps de recepción local, no del emisor: los relojes remotos no son fiables.
  const lastSeen = useRef(new Map<number, number>())

  useEffect(() => {
    const awareness = provider?.awareness
    if (!awareness) return

    const read = () => {
      const now = Date.now()
      const next: RemoteCursor[] = []

      for (const [clientId, raw] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue

        const state = raw as Presence
        if (state?.cursor) {
          lastSeen.current.set(clientId, now)
          next.push({
            clientId,
            name: state.name ?? 'anónimo',
            color: state.color ?? '#bf616a',
            x: state.cursor.x,
            y: state.cursor.y,
          })
        }
      }

      // Segunda defensa del spec: descartar por antigüedad sin esperar al servidor,
      // porque si cae la réplica que sostenía el socket muerto nadie emite la purga.
      const stale = new Set(staleClientIds(lastSeen.current, now, CURSOR_TTL_MS))
      for (const clientId of stale) lastSeen.current.delete(clientId)

      setCursors(next.filter((c) => !stale.has(c.clientId)))
    }

    awareness.on('change', read)
    const sweep = setInterval(read, SWEEP_INTERVAL_MS)
    read()

    return () => {
      awareness.off('change', read)
      clearInterval(sweep)
    }
  }, [provider])

  return cursors
}
