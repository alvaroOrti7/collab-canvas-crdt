import { expect, test } from 'vitest'
import { compareZ, keyAfter, keyBetween } from '../src/z-index.js'
import type { ShapeId } from '../src/types.js'

const s = (id: ShapeId, zIndex: string) => ({ id, zIndex })

test('la primera clave de un board vacío es estable', () => {
  expect(keyBetween(null, null)).toBe('a0')
})

test('keyAfter produce una clave mayor que la anterior', () => {
  const first = keyAfter(null)
  const second = keyAfter(first)
  expect(second > first).toBe(true)
})

test('keyBetween cae estrictamente entre sus vecinos', () => {
  const mid = keyBetween('a0', 'a1')
  expect(mid > 'a0').toBe(true)
  expect(mid < 'a1').toBe(true)
})

test('ordena por zIndex cuando las claves difieren', () => {
  const shapes = [s('x', 'a2'), s('y', 'a0'), s('z', 'a1')]
  expect([...shapes].sort(compareZ).map((v) => v.id)).toEqual(['y', 'z', 'x'])
})

test('con zIndex idéntico desempata por id de forma determinista', () => {
  const shapes = [s('bbb', 'a0'), s('aaa', 'a0')]
  expect([...shapes].sort(compareZ).map((v) => v.id)).toEqual(['aaa', 'bbb'])
})

test('el orden resultante no depende del orden de entrada', () => {
  const a = s('aaa', 'a0')
  const b = s('bbb', 'a0')
  const c = s('ccc', 'a0')

  const forward = [a, b, c].sort(compareZ).map((v) => v.id)
  const backward = [c, b, a].sort(compareZ).map((v) => v.id)

  expect(forward).toEqual(backward)
})
