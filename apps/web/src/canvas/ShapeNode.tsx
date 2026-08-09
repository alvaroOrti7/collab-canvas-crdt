import { Ellipse, Line, Rect, Text } from 'react-konva'
import type { Shape } from '@canvas/canvas-core'

export interface ShapeNodeProps {
  shape: Shape
  selected: boolean
  onSelect: (id: string) => void
  draggable: boolean
}

export function ShapeNode({ shape, selected, onSelect, draggable }: ShapeNodeProps) {
  const common = {
    id: shape.id,
    rotation: shape.rotation,
    draggable,
    onMouseDown: () => onSelect(shape.id),
    stroke: selected ? '#5e81ac' : shape.stroke,
    strokeWidth: selected ? 3 : 1,
  }

  switch (shape.type) {
    case 'rect':
      return <Rect {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={shape.fill} />

    case 'ellipse':
      // Konva centra la elipse en (x,y); el modelo guarda la esquina de la caja, así que
      // hay que desplazar medio ancho y medio alto.
      return (
        <Ellipse
          {...common}
          x={shape.x + shape.w / 2}
          y={shape.y + shape.h / 2}
          radiusX={shape.w / 2}
          radiusY={shape.h / 2}
          fill={shape.fill}
        />
      )

    case 'text':
      return <Text {...common} x={shape.x} y={shape.y} width={shape.w} text={shape.text} fontSize={18} fill={shape.stroke} />

    case 'arrow':
      return <Line {...common} x={shape.x} y={shape.y} points={[0, 0, shape.w, shape.h]} strokeWidth={selected ? 4 : 2} />
  }
}
