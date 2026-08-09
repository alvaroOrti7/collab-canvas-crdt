import * as Y from 'yjs'
import { shapesMap } from './doc.js'
import type { ShapeId, ShapeProps, ShapeType } from './types.js'
import { compareZ, keyAfter } from './z-index.js'

export interface NewShape {
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  text?: string
}

export type ShapePatch = Partial<
  Pick<ShapeProps, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'fill' | 'stroke' | 'zIndex'>
>

const DEFAULT_FILL = '#d8dee9'
const DEFAULT_STROKE = '#2e3440'

function highestZIndex(doc: Y.Doc): string | null {
  let highest: string | null = null
  for (const shape of shapesMap(doc).values()) {
    const zIndex = shape.get('zIndex')
    if (typeof zIndex !== 'string') continue
    if (highest === null || compareZ({ id: '', zIndex }, { id: '', zIndex: highest }) > 0) {
      highest = zIndex
    }
  }
  return highest
}

export function addShape(doc: Y.Doc, shape: NewShape, id: ShapeId = crypto.randomUUID()): ShapeId {
  const zIndex = keyAfter(highestZIndex(doc))

  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('type', shape.type)
    entry.set('x', shape.x)
    entry.set('y', shape.y)
    entry.set('w', shape.w)
    entry.set('h', shape.h)
    entry.set('rotation', 0)
    entry.set('fill', shape.fill ?? DEFAULT_FILL)
    entry.set('stroke', shape.stroke ?? DEFAULT_STROKE)
    entry.set('zIndex', zIndex)

    // El contenido de texto es Y.Text incluso cuando la fase 1 no lo edita: cambiar el
    // tipo más adelante obligaría a migrar documentos ya persistidos.
    if (shape.type === 'text') {
      const content = new Y.Text()
      if (shape.text) content.insert(0, shape.text)
      entry.set('content', content)
    }

    shapesMap(doc).set(id, entry)
  })

  return id
}

export function updateShape(doc: Y.Doc, id: ShapeId, patch: ShapePatch): void {
  const entry = shapesMap(doc).get(id)
  // No-op intencional: si otro cliente borró la forma concurrentemente, este patch no debe
  // resucitarla creando una entrada nueva a medias.
  if (!entry) return

  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value)
    }
  })
}

export function deleteShapes(doc: Y.Doc, ids: readonly ShapeId[]): void {
  doc.transact(() => {
    const shapes = shapesMap(doc)
    for (const id of ids) shapes.delete(id)
  })
}
