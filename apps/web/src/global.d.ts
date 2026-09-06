import type { Presence, Shape } from '@canvas/canvas-core'
import type * as Y from 'yjs'

declare global {
  interface Window {
    /**
     * Puente de test, solo en dev. Cada clave la publica un dueño distinto y en un momento
     * distinto (`readShapes` y `localDragging` desde useCanvasDoc, `layerNames` desde
     * CanvasStage), así que todas son opcionales: quien las consuma debe esperar a que
     * existan.
     */
    __canvas?: {
      readShapes?: () => Shape[]
      layerNames?: () => string[]
      /** Estado local de awareness (`dragging`) mientras un gesto de arrastre está en curso. */
      localDragging?: () => Presence['dragging']
      remoteCursorCount?: () => number
      remoteDragging?: () => Record<string, { x: number; y: number }>
      /** Posición real del nodo de Konva, para poder afirmar sobre lo pintado y no sobre el dato. */
      shapePosition?: (id: string) => { x: number; y: number } | null
      /** Posición pintada (post-interpolación) del primer cursor remoto, no el dato bruto de awareness. */
      remoteCursorPosition?: () => { x: number; y: number } | null
    }
    __canvasDoc?: Y.Doc
    __updateCount?: number
  }
}
