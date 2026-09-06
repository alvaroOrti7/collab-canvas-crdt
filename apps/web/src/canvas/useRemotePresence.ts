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

export interface RemotePresence {
  cursors: RemoteCursor[]
  /** Posiciones provisionales de formas que otros están arrastrando ahora mismo. */
  dragging: Record<string, { x: number; y: number }>
}

/** Cadencia de reevaluación del TTL. No hace falta más fino: el umbral es de 30 s. */
const SWEEP_INTERVAL_MS = 5_000

/**
 * Devolver el mismo objeto cuando nada cambió evita re-renderizar el árbol entero de formas
 * en cada evento de awareness — y `setLocalState` emite uno también para el propio cliente,
 * así que sin esto un solo usuario moviendo el ratón ya reconciliaría todo a 25 Hz.
 */
function samePresence(
  prev: RemotePresence,
  cursors: RemoteCursor[],
  dragging: RemotePresence['dragging'],
): boolean {
  if (prev.cursors.length !== cursors.length) return false
  for (let i = 0; i < cursors.length; i++) {
    const a = prev.cursors[i]!
    const b = cursors[i]!
    if (a.clientId !== b.clientId || a.x !== b.x || a.y !== b.y || a.name !== b.name || a.color !== b.color) {
      return false
    }
  }
  const prevKeys = Object.keys(prev.dragging)
  const nextKeys = Object.keys(dragging)
  if (prevKeys.length !== nextKeys.length) return false
  return nextKeys.every((k) => {
    const a = prev.dragging[k]
    const b = dragging[k]!
    return a != null && a.x === b.x && a.y === b.y
  })
}

export function useRemotePresence(provider: HocuspocusProvider | null): RemotePresence {
  const [presence, setPresence] = useState<RemotePresence>({ cursors: [], dragging: {} })
  // Timestamps de recepción local, no del emisor: los relojes remotos no son fiables.
  const lastSeen = useRef(new Map<number, number>())

  useEffect(() => {
    const awareness = provider?.awareness
    if (!awareness) return

    const read = () => {
      const now = Date.now()
      const next: RemoteCursor[] = []
      const drags: RemotePresence['dragging'] = {}

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
        if (state?.dragging) Object.assign(drags, state.dragging)
      }

      // Segunda defensa del spec: descartar por antigüedad sin esperar al servidor,
      // porque si cae la réplica que sostenía el socket muerto nadie emite la purga.
      const stale = new Set(staleClientIds(lastSeen.current, now, CURSOR_TTL_MS))
      for (const clientId of stale) lastSeen.current.delete(clientId)

      const visible = next.filter((c) => !stale.has(c.clientId))
      setPresence((prev) => (samePresence(prev, visible, drags) ? prev : { cursors: visible, dragging: drags }))
    }

    awareness.on('change', read)
    const sweep = setInterval(read, SWEEP_INTERVAL_MS)
    read()

    return () => {
      awareness.off('change', read)
      clearInterval(sweep)
    }
  }, [provider])

  return presence
}
