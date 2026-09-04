import { expect, test } from 'vitest'
import * as Y from 'yjs'
import { addShape, deleteShapes, updateShape } from '../src/operations.js'
import { readShapes } from '../src/selectors.js'

function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

test('dos clientes particionados convergen al reconectar', () => {
  const a = new Y.Doc()
  const b = new Y.Doc()

  const shared = addShape(a, { type: 'rect', x: 0, y: 0, w: 100, h: 100 }, 'shared')
  sync(a, b)

  // --- partición: ninguno ve al otro ---
  updateShape(a, shared, { x: 500 })
  addShape(a, { type: 'ellipse', x: 10, y: 10, w: 50, h: 50 }, 'only-a')

  updateShape(b, shared, { fill: '#00ff00' })
  addShape(b, { type: 'arrow', x: 20, y: 20, w: 80, h: 40 }, 'only-b')
  // --- reconexión ---
  sync(a, b)

  const fromA = readShapes(a)
  const fromB = readShapes(b)

  expect(fromA).toEqual(fromB)
  expect(fromA.map((s) => s.id)).toEqual(['shared', 'only-a', 'only-b'])

  const merged = fromA.find((s) => s.id === 'shared')!
  expect(merged.x).toBe(500)
  expect(merged.fill).toBe('#00ff00')
})

test('un borrado durante la partición se propaga al reconectar', () => {
  const a = new Y.Doc()
  const b = new Y.Doc()
  const id = addShape(a, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'doomed')
  sync(a, b)

  deleteShapes(a, [id])
  updateShape(b, id, { x: 42 })
  sync(a, b)

  expect(readShapes(a)).toEqual([])
  expect(readShapes(b)).toEqual([])
})

test('tres réplicas convergen al mismo orden pese a crear a la vez', () => {
  const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()]

  docs.forEach((doc, index) => {
    addShape(doc, { type: 'rect', x: index, y: index, w: 10, h: 10 }, `from-${index}`)
  })

  // Malla completa, dos veces: la segunda pasada propaga lo que llegó en la primera.
  for (let round = 0; round < 2; round++) {
    for (const a of docs) for (const b of docs) if (a !== b) sync(a, b)
  }

  const orders = docs.map((doc) => readShapes(doc).map((s) => s.id))
  expect(orders[1]).toEqual(orders[0])
  expect(orders[2]).toEqual(orders[0])
  expect(orders[0]).toHaveLength(3)
})
