import { expect, test } from 'vitest'
import * as Y from 'yjs'
import { addShape, deleteShapes, updateShape } from '../src/operations.js'
import { readShape, readShapes } from '../src/selectors.js'

/** Sincroniza dos docs en ambos sentidos, como haría el servidor. */
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

function pair(): [Y.Doc, Y.Doc] {
  return [new Y.Doc(), new Y.Doc()]
}

test('cambios concurrentes en propiedades distintas de la misma forma sobreviven ambos', () => {
  const [a, b] = pair()
  const id = addShape(a, { type: 'rect', x: 0, y: 0, w: 100, h: 50 }, 'shape-1')
  sync(a, b)

  // Sin red entre ellos: A mueve, B recolorea.
  updateShape(a, id, { x: 300 })
  updateShape(b, id, { fill: '#ff0000' })
  sync(a, b)

  for (const doc of [a, b]) {
    const shape = readShape(doc, id)
    expect(shape?.x).toBe(300)
    expect(shape?.fill).toBe('#ff0000')
  }
})

test('dos formas creadas a la vez conviven y ordenan igual en ambos clientes', () => {
  const [a, b] = pair()
  addShape(a, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'from-a')
  addShape(b, { type: 'ellipse', x: 5, y: 5, w: 10, h: 10 }, 'from-b')
  sync(a, b)

  const idsA = readShapes(a).map((s) => s.id)
  const idsB = readShapes(b).map((s) => s.id)

  expect(idsA).toHaveLength(2)
  expect(idsA).toEqual(idsB)
})

test('borrar en un cliente gana sobre editar en el otro', () => {
  const [a, b] = pair()
  const id = addShape(a, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'shape-1')
  sync(a, b)

  deleteShapes(a, [id])
  updateShape(b, id, { x: 999 })
  sync(a, b)

  // El Y.Map de la forma se elimina del mapa raíz: el update de B se aplica sobre un
  // sub-mapa huérfano y no resucita la forma. Verificar esto es importante porque la
  // alternativa (la forma reaparece con datos parciales) sería un bug silencioso.
  expect(readShape(a, id)).toBeNull()
  expect(readShape(b, id)).toBeNull()
})

test('una forma de texto conserva su contenido al sincronizar', () => {
  const [a, b] = pair()
  const id = addShape(a, { type: 'text', x: 0, y: 0, w: 200, h: 40, text: 'hola' }, 'text-1')
  sync(a, b)

  expect(readShape(b, id)?.text).toBe('hola')
})

test('addShape asigna zIndex creciente a cada forma nueva', () => {
  const doc = new Y.Doc()
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'first')
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'second')

  const [first, second] = readShapes(doc)
  expect(second!.zIndex > first!.zIndex).toBe(true)
})
