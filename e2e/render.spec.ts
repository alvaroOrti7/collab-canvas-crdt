import { expect, test } from '@playwright/test'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { addShape } from '@canvas/canvas-core'
import { boardUrl, shapesIn, waitForShapeCount } from './helpers.js'

const BOARD = 'e2e-render'

test('una forma sembrada desde otro cliente aparece en el navegador', async ({ page }) => {
  const doc = new Y.Doc()

  // El servidor de sincronización rechaza un board sin fila en `boards`, así que este
  // cliente sembrador tiene que asegurarlo igual que hace la aplicación. Antes no hacía
  // falta porque `sync` aceptaba cualquier nombre de documento: justamente el agujero que
  // esta tarea cierra.
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  const ensured = await fetch(`${apiUrl}/boards/${encodeURIComponent(BOARD)}`, { method: 'PUT' })
  expect(ensured.ok).toBe(true)

  // Sin `WebSocketPolyfill` ni dependencia `ws`: Node 24 trae un WebSocket global
  // compatible, verificado empíricamente. Y se espera con el callback `onSynced` de la
  // configuración, no con `provider.on('synced', ...)`, que no está en los tipos públicos.
  let provider!: HocuspocusProvider
  await new Promise<void>((resolve) => {
    provider = new HocuspocusProvider({
      url: process.env.SYNC_URL ?? 'ws://localhost:1234',
      name: BOARD,
      document: doc,
      onSynced: () => resolve(),
    })
  })

  addShape(doc, { type: 'rect', x: 40, y: 60, w: 120, h: 80, fill: '#ff0000' }, 'seeded')

  await page.goto(boardUrl(BOARD))
  await waitForShapeCount(page, 1)

  const [shape] = await shapesIn(page)
  expect(shape).toMatchObject({ id: 'seeded', type: 'rect', x: 40, y: 60, fill: '#ff0000' })

  // El canvas se pinta de verdad, no solo el estado.
  await expect(page.locator('canvas').first()).toBeVisible()

  provider.destroy()
})

test('el stage monta las tres capas del spec, en orden', async ({ page }) => {
  await page.goto(boardUrl(BOARD))

  // Se interroga al Stage real de Konva, no al número de elementos <canvas>: cuántos
  // canvas crea Konva para una capa vacía es un detalle interno suyo, y afirmar sobre él
  // haría fallar el test sin que el diseño haya cambiado.
  await page.waitForFunction(() => (window.__canvas?.layerNames?.().length ?? 0) === 3, undefined, {
    timeout: 10_000,
  })
  // `!` justificado: el waitForFunction anterior ya confirmó que layerNames existe y
  // devuelve 3 elementos.
  expect(await page.evaluate(() => window.__canvas!.layerNames!())).toEqual([
    'layer-static',
    'layer-interaction',
    'layer-overlay',
  ])
})
