import { useEffect, useRef } from 'react'
import { Group, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import type { RemoteCursor } from './useRemotePresence.js'

export interface CursorOverlayProps {
  cursors: RemoteCursor[]
}

/** Fracción del camino recorrida por frame. 0.2 da un seguimiento suave sin retraso visible. */
const LERP_FACTOR = 0.2

/**
 * Awareness llega a ~25Hz y la pantalla pinta a 60: sin interpolación los cursores se
 * mueven a saltos. Un único bucle rAF para todos, no uno por cursor.
 */
export function CursorOverlay({ cursors }: CursorOverlayProps) {
  const groups = useRef(new Map<number, Konva.Group>())
  const targets = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    for (const cursor of cursors) targets.current.set(cursor.clientId, { x: cursor.x, y: cursor.y })
  }, [cursors])

  useEffect(() => {
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
  }, [])

  return (
    <>
      {cursors.map((cursor) => (
        <Group
          key={cursor.clientId}
          ref={(node) => {
            if (node) groups.current.set(cursor.clientId, node)
            else groups.current.delete(cursor.clientId)
          }}
          x={cursor.x}
          y={cursor.y}
        >
          <Circle radius={5} fill={cursor.color} />
          <Text x={8} y={-4} text={cursor.name} fontSize={12} fill={cursor.color} />
        </Group>
      ))}
    </>
  )
}
