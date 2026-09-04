import { useCallback, useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { addShape, deleteShapes, type ShapeId, type ShapeType } from '@canvas/canvas-core'
import { ShapeNode } from './ShapeNode.js'
import { useCanvasDoc } from './useCanvasDoc.js'
import { useDragCommit, DRAG_THROTTLE_MS } from './useDragCommit.js'
import { useRemotePresence } from './useRemotePresence.js'
import { CursorOverlay } from './CursorOverlay.js'
import { Toolbar } from '../toolbar/Toolbar.js'

/** Paleta rotada por clientId para que cada usuario tenga un color estable en la sesión. */
const CURSOR_PALETTE = ['#bf616a', '#a3be8c', '#ebcb8b', '#b48ead', '#88c0d0']

const HEADER_HEIGHT = 48

/** Tamaños por defecto al crear. La elipse es cuadrada para que el botón "círculo" lo sea. */
const DEFAULTS: Record<ShapeType, { w: number; h: number; text?: string }> = {
  rect: { w: 160, h: 100 },
  ellipse: { w: 120, h: 120 },
  text: { w: 200, h: 32, text: 'Texto' },
  arrow: { w: 140, h: 90 },
}

export interface CanvasStageProps {
  boardId: string
}

export function CanvasStage({ boardId }: CanvasStageProps) {
  const { doc, provider, shapes, status } = useCanvasDoc(boardId)
  const [selected, setSelected] = useState<ShapeId | null>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const drag = useDragCommit(doc, provider)
  const cursors = useRemotePresence(provider)
  const lastCursor = useRef(0)

  // Se conserva de la Task 9: el test de las tres capas depende de este puente.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = {
      ...window.__canvas!,
      layerNames: () => stageRef.current?.getLayers().map((layer) => layer.name()) ?? [],
    }
  }, [])

  // Task 12: el conteo de cursores remotos vive aquí (lo produce useRemotePresence), así
  // que esta pieza del puente la completa CanvasStage y no useCanvasDoc.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = { ...window.__canvas!, remoteCursorCount: () => cursors.length }
  }, [cursors.length])

  // Publica identidad una sola vez al conectar: el otro cliente necesita nombre y color
  // para pintar el cursor la primera vez que aparece.
  useEffect(() => {
    if (!provider?.awareness) return
    provider.awareness.setLocalStateField('name', `usuario-${provider.awareness.clientID % 1000}`)
    provider.awareness.setLocalStateField(
      'color',
      CURSOR_PALETTE[provider.awareness.clientID % CURSOR_PALETTE.length],
    )
  }, [provider])

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const now = performance.now()
      if (now - lastCursor.current < DRAG_THROTTLE_MS) return
      lastCursor.current = now

      const point = e.target.getStage()?.getPointerPosition()
      if (point) provider?.awareness?.setLocalStateField('cursor', { x: point.x, y: point.y })
    },
    [provider],
  )

  const handleCreate = useCallback(
    (type: ShapeType) => {
      const { w, h, text } = DEFAULTS[type]
      // Desplazamiento por número de formas para que no se apilen exactamente encima.
      const offset = shapes.length * 24
      addShape(doc, { type, x: 60 + offset, y: 60 + offset, w, h, text })
    },
    [doc, shapes.length],
  )

  const handleDelete = useCallback(() => {
    if (!selected) return
    deleteShapes(doc, [selected])
    setSelected(null)
  }, [doc, selected])

  return (
    <>
      <header style={{ height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', gap: 16, padding: '0 12px' }}>
        <strong>Lienzo colaborativo</strong>
        <Toolbar onCreate={handleCreate} onDelete={handleDelete} canDelete={selected !== null} />
        <span data-testid="connection-status">{status}</span>
      </header>

      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight - HEADER_HEIGHT}
        onMouseMove={handleMouseMove}
      >
        <Layer name="layer-static">
          {shapes.map((shape) => (
            <ShapeNode
              key={shape.id}
              shape={shape}
              selected={shape.id === selected}
              onSelect={setSelected}
              draggable
              onDragMove={drag.onDragMove}
              onDragEnd={drag.onDragEnd}
            />
          ))}
        </Layer>
        <Layer name="layer-interaction" />
        <Layer name="layer-overlay">
          <CursorOverlay cursors={cursors} />
        </Layer>
      </Stage>
    </>
  )
}
