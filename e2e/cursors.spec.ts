import { expect, test } from '@playwright/test'
import { boardUrl } from './helpers.js'

async function cursorCount(page: import('@playwright/test').Page): Promise<number> {
  // `!` en ambos: se llama después de esperar con waitForFunction, que ya garantiza que
  // remoteCursorCount existe (mismo patrón que `shapesIn` en helpers.ts para readShapes).
  return page.evaluate(() => window.__canvas!.remoteCursorCount!())
}

test('el cursor del otro usuario aparece al moverse', async ({ browser }) => {
  const board = boardUrl(`e2e-cursor-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.mouse.move(300, 300)
  await a.mouse.move(320, 310)

  await b.waitForFunction(() => window.__canvas?.remoteCursorCount?.() === 1, undefined, {
    timeout: 10_000,
  })
  expect(await cursorCount(b)).toBe(1)

  await a.close()
  await b.close()
})

// OJO con lo que este test cubre y lo que no. `page.close()` cierra el socket de forma que
// el servidor detecta, así que la purga la propaga él: verificado empíricamente que el test
// sigue pasando aunque se deshabilite el descarte por antigüedad del cliente. Es decir,
// cubre el camino limpio, NO la partición de red que justifica la segunda capa de defensa.
// Esa lógica está cubierta aparte por los 5 tests unitarios de `staleClientIds`. Reproducir
// una partición real en un E2E exigiría un socket semi-abierto, que Playwright no ofrece de
// forma determinista.
test('el cursor desaparece cuando el otro cierra la pestaña', async ({ browser }) => {
  const board = boardUrl(`e2e-ghost-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.mouse.move(200, 200)
  await b.waitForFunction(() => window.__canvas?.remoteCursorCount?.() === 1, undefined, {
    timeout: 10_000,
  })

  await a.close()

  // El cierre del contexto termina el socket, y el awareness se purga al propagarse.
  // Si esto falla, revisa que el provider no se esté quedando sin destruir.
  await b.waitForFunction(() => window.__canvas?.remoteCursorCount?.() === 0, undefined, {
    timeout: 15_000,
  })
  expect(await cursorCount(b)).toBe(0)

  await b.close()
})
