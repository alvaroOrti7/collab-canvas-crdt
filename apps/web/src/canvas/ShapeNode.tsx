import { Ellipse, Line, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Shape } from '@canvas/canvas-core'

export interface ShapeNodeProps {
  shape: Shape
  selected: boolean
  onSelect: (id: string) => void
  draggable: boolean
  onDragMove: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  /** Posición provisional publicada por otro cliente que está arrastrando esta forma. */
  remotePosition?: { x: number; y: number }
}

export function ShapeNode({
  shape,
  selected,
  onSelect,
  draggable,
  onDragMove,
  onDragEnd,
  remotePosition,
}: ShapeNodeProps) {
  // Mientras otro arrastra, se pinta su posición provisional; el documento todavía no la
  // tiene, porque el commit ocurre al soltar.
  const x = remotePosition?.x ?? shape.x
  const y = remotePosition?.y ?? shape.y

  const common = {
    id: shape.id,
    rotation: shape.rotation,
    draggable,
    onMouseDown: () => onSelect(shape.id),
    onDragMove: (e: KonvaEventObject<DragEvent>) => onDragMove(shape.id, e.target.x(), e.target.y()),
    onDragEnd: (e: KonvaEventObject<DragEvent>) => onDragEnd(shape.id, e.target.x(), e.target.y()),
    stroke: selected ? '#5e81ac' : shape.stroke,
    strokeWidth: selected ? 3 : 1,
  }

  switch (shape.type) {
    case 'rect':
      return <Rect {...common} x={x} y={y} width={shape.w} height={shape.h} fill={shape.fill} />

    case 'ellipse':
      // Konva centra la elipse en (x,y); el modelo guarda la esquina de la caja, así que hay
      // que desplazar medio ancho y medio alto al pintar, y deshacer ese desplazamiento en
      // AMBOS handlers antes de propagar. Si solo se corrige en onDragEnd, `Presence.dragging`
      // (awareness, mientras el gesto está en curso) significaría esquina para el resto de
      // formas pero centro para la elipse, y quien la pinte la vería saltar media caja.
      return (
        <Ellipse
          {...common}
          x={x + shape.w / 2}
          y={y + shape.h / 2}
          radiusX={shape.w / 2}
          radiusY={shape.h / 2}
          fill={shape.fill}
          onDragMove={(e: KonvaEventObject<DragEvent>) =>
            onDragMove(shape.id, e.target.x() - shape.w / 2, e.target.y() - shape.h / 2)
          }
          onDragEnd={(e: KonvaEventObject<DragEvent>) =>
            onDragEnd(shape.id, e.target.x() - shape.w / 2, e.target.y() - shape.h / 2)
          }
        />
      )

    case 'text':
      return <Text {...common} x={x} y={y} width={shape.w} text={shape.text} fontSize={18} fill={shape.stroke} />

    case 'arrow':
      return <Line {...common} x={x} y={y} points={[0, 0, shape.w, shape.h]} strokeWidth={selected ? 4 : 2} />
  }
}
