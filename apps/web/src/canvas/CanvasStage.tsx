import { useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { ShapeId } from '@canvas/canvas-core'
import { ShapeNode } from './ShapeNode.js'
import { useCanvasDoc } from './useCanvasDoc.js'

export interface CanvasStageProps {
  boardId: string
}

export function CanvasStage({ boardId }: CanvasStageProps) {
  const { shapes, status } = useCanvasDoc(boardId)
  const [selected, setSelected] = useState<ShapeId | null>(null)
  const stageRef = useRef<Konva.Stage>(null)

  // Completa el puente de test con los nombres de capa leídos del Stage real. Va aquí
  // porque este componente es el dueño del Stage; useCanvasDoc no lo conoce.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = {
      ...window.__canvas!,
      layerNames: () => stageRef.current?.getLayers().map((layer) => layer.name()) ?? [],
    }
  }, [])

  return (
    <Stage
      ref={stageRef}
      width={window.innerWidth}
      height={window.innerHeight - 48}
      data-status={status}
    >
      {/* Tres capas separadas para que un cursor remoto no repinte las formas en reposo. */}
      <Layer name="layer-static">
        {shapes.map((shape) => (
          <ShapeNode
            key={shape.id}
            shape={shape}
            selected={shape.id === selected}
            onSelect={setSelected}
            draggable={false}
          />
        ))}
      </Layer>
      <Layer name="layer-interaction" />
      <Layer name="layer-overlay" />
    </Stage>
  )
}
