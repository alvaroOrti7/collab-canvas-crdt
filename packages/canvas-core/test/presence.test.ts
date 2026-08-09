import { expect, test } from 'vitest'
import { CURSOR_TTL_MS, staleClientIds } from '../src/presence.js'

test('no purga a nadie cuando todos son recientes', () => {
  const now = 100_000
  const seen = new Map([
    [1, now - 1_000],
    [2, now - 5_000],
  ])
  expect(staleClientIds(seen, now)).toEqual([])
})

test('purga solo a quien excede el TTL', () => {
  const now = 100_000
  const seen = new Map([
    [1, now - 1_000],
    [2, now - CURSOR_TTL_MS - 1],
    [3, now - CURSOR_TTL_MS - 60_000],
  ])
  expect(staleClientIds(seen, now).sort()).toEqual([2, 3])
})

test('el umbral es exclusivo: exactamente en el TTL todavía no se purga', () => {
  const now = 100_000
  const seen = new Map([[1, now - CURSOR_TTL_MS]])
  expect(staleClientIds(seen, now)).toEqual([])
})

test('acepta un TTL propio para poder testear sin esperas', () => {
  const now = 1_000
  const seen = new Map([[7, 400]])
  expect(staleClientIds(seen, now, 500)).toEqual([7])
})

test('un mapa vacío no purga nada', () => {
  expect(staleClientIds(new Map(), 1_000)).toEqual([])
})
