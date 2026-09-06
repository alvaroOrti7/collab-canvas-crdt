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

/**
 * El servidor de sincronización rechaza un board sin fila en `boards`, así que hay que
 * asegurarla antes de abrir el WebSocket. La creación la hace el `api` y no `sync` porque en
 * la fase 2 este endpoint llevará el guard de autenticación; crear desde el WebSocket
 * dejaría que cualquiera creara boards con solo conectarse.
 */
async function ensureBoard(boardId: string): Promise<void> {
  const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`no se pudo asegurar el board "${boardId}": HTTP ${res.status}`)
}

export function useCanvasDoc(boardId: string): CanvasDoc {
  const doc = useMemo(() => new Y.Doc(), [boardId])
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    let next: HocuspocusProvider | null = null
    let cancelled = false

    // Url relativa al origen que sirvió la página, no absoluta: Vite proxea `/sync` hacia
    // el servidor de sincronización (ver `vite.config.ts`). Así funciona igual desde el
    // navegador del host que desde el de Playwright dentro de un contenedor, donde
    // `localhost` sería el propio contenedor y no alcanzaría a `sync`.
    void ensureBoard(boardId).then(() => {
      // El efecto puede haberse limpiado mientras la petición estaba en vuelo.
      if (cancelled) return

      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      next = new HocuspocusProvider({
        url: `${wsProtocol}//${location.host}/sync`,
        name: boardId,
        document: doc,
        onStatus: ({ status: s }) => {
          setStatus(s === 'connected' ? 'connected' : 'disconnected')
        },
      })
      setProvider(next)
    }).catch((error: unknown) => {
      // Sin este catch queda una promesa rechazada sin manejar y, peor, `status` se congela
      // en `connecting` para siempre: el usuario vería un spinner infinito sin ninguna pista
      // de que el problema es que no se pudo asegurar el board. Si no hay board, no hay
      // WebSocket que abrir, así que el estado honesto es `disconnected`.
      console.error(error)
      if (!cancelled) setStatus('disconnected')
    })

    // Una sola suscripción al doc entero: Yjs entrega los cambios en lote por
    // transacción, así que esto ya es el batching que pide el spec. No depende del
    // provider, así que se suscribe de inmediato en vez de esperar a `ensureBoard`.
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
        // a mitad del gesto, no solo el resultado final. `next` puede ser todavía null si
        // `ensureBoard` no ha resuelto.
        localDragging: () => (next?.awareness?.getLocalState() as Presence | undefined)?.dragging ?? null,
      }
    }

    return () => {
      doc.off('update', onUpdate)
      cancelled = true
      next?.destroy()
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
