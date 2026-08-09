export type ShapeId = string

/**
 * El "círculo" del spec se modela como elipse con `w === h`: una caja de selección
 * rectangular ya describe un círculo, y tener ambos tipos duplicaría el render y el
 * hit-testing sin añadir nada.
 */
export type ShapeType = 'rect' | 'ellipse' | 'text' | 'arrow'

export interface ShapeProps {
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  /** Grados, no radianes: es lo que espera Konva. */
  rotation: number
  fill: string
  stroke: string
  /** Índice fraccionario. Se compara como string, nunca como número. */
  zIndex: string
  /** Vacío salvo en formas de tipo `text`. Derivado del Y.Text del documento. */
  text: string
}

export interface Shape extends ShapeProps {
  id: ShapeId
}

export type ZOrdered = Pick<Shape, 'id' | 'zIndex'>
