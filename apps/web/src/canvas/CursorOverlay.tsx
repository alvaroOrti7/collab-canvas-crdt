import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { Group, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import type { RemoteCursor } from './useRemotePresence.js'

export interface CursorOverlayProps {
  cursors: RemoteCursor[]
}

/** Fracción del camino recorrida por frame. 0.2 da un seguimiento suave sin retraso visible. */
const LERP_FACTOR = 0.2

interface CursorDotProps {
  cursor: RemoteCursor
  groups: MutableRefObject<Map<number, Konva.Group>>
  targets: MutableRefObject<Map<number, { x: number; y: number }>>
}

/**
 * Un componente por cursor, no un `<Group>` inline dentro del `.map()` del padre, para que el
 * ref callback tenga identidad estable entre renders. Si fuera una arrow function inline en
 * `CursorOverlay`, cada actualización de `cursors` (~25 Hz) la recrearía; React desmonta y
 * remonta el ref cuando su identidad cambia (llamada con `null` y luego con el nodo, aunque
 * el `Group` de Konva subyacente no se destruya), y el `if (!groups.current.has(...))`
 * volvería a ser cierto en cada frame de awareness — resucitando el salto original, esta vez
 * a través del ref en lugar de la prop `x`/`y`. `useCallback` con deps ligadas al `clientId`
 * (constante durante la vida de este componente, fijado por la `key` del padre) mantiene la
 * misma función entre renders y evita el remontaje espurio.
 */
function CursorDot({ cursor, groups, targets }: CursorDotProps) {
  const attach = useCallback(
    (node: Konva.Group | null) => {
      if (node) {
        // Posición inicial directa: sin esto el cursor nacería en (0,0) y se vería
        // deslizarse hasta su sitio la primera vez que aparece.
        if (!groups.current.has(cursor.clientId)) node.position({ x: cursor.x, y: cursor.y })
        groups.current.set(cursor.clientId, node)
      } else {
        groups.current.delete(cursor.clientId)
        targets.current.delete(cursor.clientId)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- estable a propósito, ver comentario de arriba.
    [cursor.clientId, groups, targets],
  )

  return (
    <Group ref={attach}>
      <Circle radius={5} fill={cursor.color} />
      <Text x={8} y={-4} text={cursor.name} fontSize={12} fill={cursor.color} />
    </Group>
  )
}

/**
 * Awareness llega a ~25 Hz y la pantalla pinta a 60: sin interpolación los cursores van a
 * saltos. Un único bucle rAF para todos, no uno por cursor.
 *
 * La posición NO se pasa como prop del Group a propósito: react-konva la aplicaría en cuanto
 * cambia, el nodo saltaría al destino y el lerp de abajo movería exactamente cero. El bucle
 * es el único que mueve estos nodos.
 */
export function CursorOverlay({ cursors }: CursorOverlayProps) {
  const groups = useRef(new Map<number, Konva.Group>())
  const targets = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    for (const cursor of cursors) targets.current.set(cursor.clientId, { x: cursor.x, y: cursor.y })
  }, [cursors])

  // Depende de `cursors.length`, no de `[]`: sin cursores en pantalla no hay nada que mover,
  // y un rAF corriendo para siempre solo para no hacer nada es trabajo desperdiciado.
  useEffect(() => {
    if (cursors.length === 0) return
    let frame = 0

    const tick = () => {
      for (const [clientId, group] of groups.current) {
        const target = targets.current.get(clientId)
        if (!target) continue
        group.x(group.x() + (target.x - group.x()) * LERP_FACTOR)
        group.y(group.y() + (target.y - group.y()) * LERP_FACTOR)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [cursors.length])

  // Puente de test (Task 3): posición real del nodo de Konva del primer cursor remoto, para
  // poder afirmar sobre la interpolación en vez de sobre el dato bruto de awareness (que ya
  // expone `remoteCursorCount`, pero no lo que se ha pintado hasta ahora).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = {
      ...window.__canvas!,
      remoteCursorPosition: () => {
        const [first] = groups.current.values()
        return first ? { x: first.x(), y: first.y() } : null
      },
    }
    return () => {
      delete window.__canvas?.remoteCursorPosition
    }
  }, [])

  return (
    <>
      {cursors.map((cursor) => (
        <CursorDot key={cursor.clientId} cursor={cursor} groups={groups} targets={targets} />
      ))}
    </>
  )
}
