import { expect, test } from '@playwright/test'
import { boardUrl, shapesIn, waitForShapeCount } from './helpers.js'

test('las ediciones hechas sin red se sincronizan al reconectar', async ({ browser }) => {
  const board = boardUrl(`e2e-offline-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  // Corta la red de A. El documento local sigue aceptando ediciones.
  await a.context().setOffline(true)
  await a.getByTestId('tool-ellipse').click()
  await waitForShapeCount(a, 2)

  // B no debe verla mientras A está aislado.
  // Espera deliberada antes de afirmar el negativo: sin ella, si `setOffline` no tuviera
  // efecto, el update de A llegaría a B en pocos milisegundos y esta aserción pasaría o
  // fallaría según el planificador. Es la única línea que distingue "el aislamiento
  // funciona" de "todo iba conectado".
  await b.waitForTimeout(1_000)
  expect(await shapesIn(b)).toHaveLength(1)

  await a.context().setOffline(false)
  await waitForShapeCount(b, 2)

  const idsA = (await shapesIn(a)).map((s) => s.id)
  const idsB = (await shapesIn(b)).map((s) => s.id)
  expect(idsB).toEqual(idsA)

  await a.close()
  await b.close()
})

// Este test solo cubre el estado `connected`, y es deliberado. La transición a
// `disconnected` tarda unos 39 s porque `@hocuspocus/provider` usa un
// `messageReconnectTimeout` de 30 s: hasta que ese plazo vence, un socket que quedó colgado
// se sigue dando por vivo. Bajarlo haría que el indicador reaccionara antes, pero provocaría
// reconexiones espurias en una sala sin actividad, donde estar 30 s sin recibir un mensaje es
// normal. Ese ajuste, con su compromiso, pertenece a la fase 3, que es donde el spec sitúa el
// indicador de conexión; esperar 45 s aquí solo para verlo cambiar duplicaría con creces la
// duración de toda la suite E2E.
test('el indicador de conexión refleja que hay conexión', async ({ page }) => {
  await page.goto(boardUrl(`e2e-status-${Date.now()}`))
  await expect(page.getByTestId('connection-status')).toHaveText('connected', { timeout: 10_000 })
})
