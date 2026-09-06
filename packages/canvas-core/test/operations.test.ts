import { expect, test } from 'vitest'
import * as Y from 'yjs'
import { shapesMap } from '../src/doc.js'
import { addShape, deleteShapes, updateShape } from '../src/operations.js'
import { readShape, readShapes } from '../src/selectors.js'

test('actualizar una forma inexistente no crea nada ni lanza', () => {
  const doc = new Y.Doc()
  updateShape(doc, 'no-existe', { x: 10 })

  expect(readShapes(doc)).toEqual([])
  // Contra el mapa crudo, no solo contra el selector: `toShape` descarta las entradas sin
  // `type`, así que una entrada creada a medias sería invisible a `readShapes` y este test
  // pasaría igual. Verificado saboteando `updateShape` para que resucite.
  expect(shapesMap(doc).size).toBe(0)
})

test('actualizar una forma borrada no la resucita', () => {
  const doc = new Y.Doc()
  const id = addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'doomed')
  deleteShapes(doc, [id])

  updateShape(doc, id, { x: 999 })

  expect(readShape(doc, id)).toBeNull()
  expect(readShapes(doc)).toEqual([])
  // La garantía real: la clave no vuelve al mapa. Una entrada zombi sin `type` no la
  // pintaría nadie, pero se propagaría a todos los clientes y viviría en el snapshot para
  // siempre; y bastaría que otro cliente le añadiera `type` para materializar la forma.
  expect(shapesMap(doc).has(id)).toBe(false)
})

test('un patch con undefined explícito no pisa el valor existente', () => {
  const doc = new Y.Doc()
  const id = addShape(doc, { type: 'rect', x: 42, y: 7, w: 10, h: 10 }, 'shape-1')

  updateShape(doc, id, { x: undefined, y: 99 })

  const shape = readShape(doc, id)
  expect(shape?.x).toBe(42)
  expect(shape?.y).toBe(99)
})

test('borrar una lista con ids inexistentes no afecta a los que sí existen', () => {
  const doc = new Y.Doc()
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'vive')
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'muere')

  deleteShapes(doc, ['muere', 'nunca-existió'])

  expect(readShapes(doc).map((s) => s.id)).toEqual(['vive'])
})
