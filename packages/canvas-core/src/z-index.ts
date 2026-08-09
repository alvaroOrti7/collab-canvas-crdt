import { generateKeyBetween } from 'fractional-indexing'
import type { ZOrdered } from './types.js'

/**
 * `a` y `b` son las claves de los vecinos de destino, o null en los extremos.
 * `generateKeyBetween(null, null)` devuelve 'a0' con el alfabeto por defecto (A-Z/a-z).
 */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

export function keyAfter(highest: string | null): string {
  return generateKeyBetween(highest, null)
}

/**
 * Comparador de pintado. El desempate por `id` es obligatorio: dos clientes que insertan
 * en el mismo hueco pueden generar la misma clave, y sin segundo criterio el orden
 * quedaría indefinido — estado convergente, pantallas divergentes.
 */
export function compareZ(a: ZOrdered, b: ZOrdered): number {
  if (a.zIndex !== b.zIndex) return a.zIndex < b.zIndex ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
