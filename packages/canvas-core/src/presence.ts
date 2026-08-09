import type { ShapeId } from './types.js'

/**
 * Coincide con el `timeout` del servidor Hocuspocus a propósito: si el servidor corta la
 * conexión a los 30 s sin pong, el cliente no debería seguir pintando ese cursor más
 * tiempo del que el servidor tarda en confirmarlo.
 */
export const CURSOR_TTL_MS = 30_000

export interface Presence {
  name: string
  color: string
  cursor: { x: number; y: number } | null
  selection: ShapeId[]
  /** Posición provisional durante un arrastre en curso. No se persiste en el documento. */
  dragging: Record<ShapeId, { x: number; y: number }> | null
}

/**
 * Los timestamps son de recepción local, no del emisor: los relojes de clientes distintos
 * no están sincronizados y usar el reloj remoto haría que un cliente con la hora adelantada
 * pareciera eternamente vivo.
 */
export function staleClientIds(
  lastSeen: ReadonlyMap<number, number>,
  now: number,
  ttlMs: number = CURSOR_TTL_MS,
): number[] {
  const stale: number[] = []
  for (const [clientId, seenAt] of lastSeen) {
    if (now - seenAt > ttlMs) stale.push(clientId)
  }
  return stale
}
