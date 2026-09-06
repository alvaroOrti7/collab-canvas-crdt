import { useCallback, useRef } from 'react'
import type * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { updateShape, type Presence, type ShapeId } from '@canvas/canvas-core'

/** Cadencia de la posición provisional por awareness. Ver §5.2 del spec. */
export const DRAG_THROTTLE_MS = 40

export interface DragHandlers {
  onDragMove: (id: ShapeId, x: number, y: number) => void
  onDragEnd: (id: ShapeId, x: number, y: number) => void
}

/**
 * Los tres carriles del arrastre:
 *   1. Konva mueve su propio nodo (no pasa por aquí y por eso va a 60fps).
 *   2. Aquí se publica la posición provisional por awareness, con throttle.
 *   3. Al soltar, una única escritura en el documento.
 * Escribir en Yjs en cada mousemove inflaría el documento y saturaría la red.
 */
export function useDragCommit(doc: Y.Doc, provider: HocuspocusProvider | null): DragHandlers {
  const lastPublished = useRef(0)

  const onDragMove = useCallback(
    (id: ShapeId, x: number, y: number) => {
      if (!provider) return

      const now = performance.now()
      if (now - lastPublished.current < DRAG_THROTTLE_MS) return
      lastPublished.current = now

      const current = provider.awareness?.getLocalState() as Presence | null
      provider.awareness?.setLocalStateField('dragging', {
        ...(current?.dragging ?? {}),
        [id]: { x, y },
      })
    },
    [provider],
  )

  const onDragEnd = useCallback(
    (id: ShapeId, x: number, y: number) => {
      updateShape(doc, id, { x, y })
      // Se borra solo la clave de esta forma, no el objeto entero: limpiar todo perdería el
      // estado de cualquier otro arrastre en curso del mismo cliente.
      const current = (provider?.awareness?.getLocalState() as Presence | null)?.dragging ?? {}
      const { [id]: _removed, ...rest } = current
      provider?.awareness?.setLocalStateField('dragging', Object.keys(rest).length ? rest : null)
      lastPublished.current = 0
    },
    [doc, provider],
  )

  return { onDragMove, onDragEnd }
}
