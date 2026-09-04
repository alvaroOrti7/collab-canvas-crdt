import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { readShapes, type Presence, type Shape } from '@canvas/canvas-core'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface CanvasDoc {
  doc: Y.Doc
  provider: HocuspocusProvider | null
  shapes: Shape[]
  status: ConnectionStatus
}

export function useCanvasDoc(boardId: string): CanvasDoc {
  const doc = useMemo(() => new Y.Doc(), [boardId])
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    // Url relativa al origen que sirvió la página, no absoluta: Vite proxea `/sync` hacia
    // el servidor de sincronización (ver `vite.config.ts`). Así funciona igual desde el
    // navegador del host que desde el de Playwright dentro de un contenedor, donde
    // `localhost` sería el propio contenedor y no alcanzaría a `sync`.
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const next = new HocuspocusProvider({
      url: `${wsProtocol}//${location.host}/sync`,
      name: boardId,
      document: doc,
      onStatus: ({ status: s }) => {
        setStatus(s === 'connected' ? 'connected' : 'disconnected')
      },
    })
    setProvider(next)

    // Una sola suscripción al doc entero: Yjs entrega los cambios en lote por
    // transacción, así que esto ya es el batching que pide el spec.
    const onUpdate = () => setShapes(readShapes(doc))
    doc.on('update', onUpdate)
    onUpdate()

    // Puente de solo lectura para los E2E: afirmar sobre el estado del documento es
    // determinista, mientras que afirmar sobre píxeles del canvas no lo es. Vive aquí
    // porque este hook es el dueño del Y.Doc. Solo en dev.
    if (import.meta.env.DEV) {
      window.__canvasDoc = doc
      window.__canvas = {
        ...window.__canvas,
        readShapes: () => readShapes(doc),
        // El commit final (`onDragEnd`) siempre lee del nodo Konva fresco, así que nunca
        // distingue un `onDragMove` roto: para verificar de verdad la conversión
        // centro→esquina de la elipse hay que poder mirar lo que se publicó en awareness
        // a mitad del gesto, no solo el resultado final.
        localDragging: () => (next.awareness?.getLocalState() as Presence | undefined)?.dragging ?? null,
      }
    }

    return () => {
      doc.off('update', onUpdate)
      next.destroy()
      // Destruir también el documento: sin esto, cambiar de board deja el Y.Doc anterior
      // huérfano con sus observers vivos.
      doc.destroy()
      setProvider(null)
      if (import.meta.env.DEV) {
        delete window.__canvasDoc
        // Solo las claves propias. Borrar `window.__canvas` entero se llevaría por delante
        // `layerNames`, que publica CanvasStage en un efecto que no vuelve a ejecutarse
        // si únicamente cambia el board.
        delete window.__canvas?.readShapes
        delete window.__canvas?.localDragging
      }
    }
  }, [boardId, doc])

  return { doc, provider, shapes, status }
}
