import type * as Y from 'yjs'
import { shapesMap } from './doc.js'
import type { Shape, ShapeId, ShapeType } from './types.js'
import { compareZ } from './z-index.js'

function toShape(id: ShapeId, entry: Y.Map<unknown>): Shape | null {
  const type = entry.get('type') as ShapeType | undefined
  const zIndex = entry.get('zIndex')
  // Una entrada sin type o sin zIndex es un documento a medio escribir por una versión
  // anterior del cliente; se ignora en lugar de romper el render entero.
  if (!type || typeof zIndex !== 'string') return null

  const content = entry.get('content') as { toString(): string } | undefined

  return {
    id,
    type,
    zIndex,
    x: Number(entry.get('x') ?? 0),
    y: Number(entry.get('y') ?? 0),
    w: Number(entry.get('w') ?? 0),
    h: Number(entry.get('h') ?? 0),
    rotation: Number(entry.get('rotation') ?? 0),
    fill: String(entry.get('fill') ?? '#d8dee9'),
    stroke: String(entry.get('stroke') ?? '#2e3440'),
    text: content ? content.toString() : '',
  }
}

/** Devuelve las formas ya ordenadas para pintar. El consumidor no debe reordenar. */
export function readShapes(doc: Y.Doc): Shape[] {
  const shapes: Shape[] = []
  for (const [id, entry] of shapesMap(doc).entries()) {
    const shape = toShape(id, entry)
    if (shape) shapes.push(shape)
  }
  return shapes.sort(compareZ)
}

export function readShape(doc: Y.Doc, id: ShapeId): Shape | null {
  const entry = shapesMap(doc).get(id)
  return entry ? toShape(id, entry) : null
}
