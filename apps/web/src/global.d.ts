import type { Shape } from '@canvas/canvas-core'
import type * as Y from 'yjs'

declare global {
  interface Window {
    /**
     * Puente de test, solo en dev. Cada clave la publica un dueño distinto y en un momento
     * distinto (`readShapes` desde useCanvasDoc, `layerNames` desde CanvasStage), así que
     * todas son opcionales: quien las consuma debe esperar a que existan.
     */
    __canvas?: {
      readShapes?: () => Shape[]
      layerNames?: () => string[]
    }
    __canvasDoc?: Y.Doc
  }
}
