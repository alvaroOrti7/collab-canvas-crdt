// `import type`: en este fichero `Y` solo aparece en posición de tipo. Es la misma
// convención que sigue selectors.ts; operations.ts sí necesita el import de valor porque
// construye `new Y.Map()` y `new Y.Text()`.
import type * as Y from 'yjs'

export const SHAPES_KEY = 'shapes'

/**
 * Cada forma es un Y.Map anidado, no un objeto plano: así el merge es por propiedad y
 * dos usuarios editando campos distintos de la misma forma no se sobrescriben.
 */
export function shapesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(SHAPES_KEY)
}
