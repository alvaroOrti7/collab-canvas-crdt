import { expect, test } from '@playwright/test'
import { boardUrl, shapesIn, waitForShapeCount } from './helpers.js'

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

// Discrimina el bug de Task 3: `CursorOverlay` pasaba `x`/`y` como props del Group Y ADEMÁS
// interpolaba hacia el mismo destino en un rAF. react-konva aplica la prop en cuanto cambia,
// así que el nodo saltaba directo y el lerp movía cero. Este test lo detecta mirando la
// posición REAL del nodo de Konva (no el dato bruto de awareness, que llegaría idéntico en
// ambas versiones) un instante después de un salto grande: con la interpolación activa hacen
// falta ~29 frames (~480 ms, LERP_FACTOR=0.2) para acercarse a 1px del destino, así que en
// cuanto se detecta el primer movimiento el nodo sigue muy lejos de llegar. Con el bug, el
// primer movimiento detectado YA es la llegada.
test('el cursor remoto interpola hacia el destino, no salta directo', async ({ browser }) => {
  const board = boardUrl(`e2e-cursor-lerp-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  // +48: el mouse de Playwright es relativo a la página, pero `getPointerPosition()` de Konva
  // es relativo al Stage, que empieza justo debajo del header de 48px (mismo ajuste que en
  // drag.spec.ts).
  const HEADER = 48
  const startX = 150
  const startY = 150
  await a.mouse.move(startX, startY + HEADER)

  await b.waitForFunction(() => window.__canvas?.remoteCursorCount?.() === 1, undefined, {
    timeout: 10_000,
  })

  // El ref callback fija la posición inicial directamente (sin ella el cursor nacería en
  // (0,0) y se deslizaría hasta su sitio), así que ya debería estar exactamente aquí.
  await b.waitForFunction(
    (target) => {
      const pos = window.__canvas?.remoteCursorPosition?.()
      return pos != null && Math.abs(pos.x - target.x) < 2 && Math.abs(pos.y - target.y) < 2
    },
    { x: startX, y: startY },
    { timeout: 5_000 },
  )

  // Más de un DRAG_THROTTLE_MS (40 ms) desde el primer `mouse.move`: `handleMouseMove`
  // comparte el mismo throttle que el arrastre, y sin esta espera el salto puede llegar
  // antes de que la ventana expire y quedarse descartado en silencio (mismo ajuste que en
  // drag.spec.ts, pero aquí hace falta porque el `waitForFunction` de arriba puede resolver
  // en menos de 40 ms cuando el entorno va rápido).
  await a.waitForTimeout(60)

  const jumpX = startX + 600
  await a.mouse.move(jumpX, startY + HEADER)

  // En cuanto el nodo empiece a moverse hacia el nuevo destino...
  await b.waitForFunction(
    (originX) => {
      const pos = window.__canvas?.remoteCursorPosition?.()
      return pos != null && pos.x > originX + 5
    },
    startX,
    { timeout: 5_000 },
  )

  // ...NO debe estar todavía en el destino. Margen generoso (~11 frames, ~180ms) para
  // absorber jitter de CI sin dejar de discriminar el bug, donde este valor sería == jumpX.
  const mid = await b.evaluate(() => window.__canvas!.remoteCursorPosition!())
  expect(mid).not.toBeNull()
  expect(mid!.x).toBeGreaterThan(startX + 5)
  expect(mid!.x).toBeLessThan(jumpX - 50)

  await a.close()
  await b.close()
})

test('el cursor de otro usuario no bloquea el clic sobre la forma que tapa', async ({ browser }) => {
  // `layer-overlay` se pinta encima de `layer-static`, así que sin `listening={false}` el
  // círculo del cursor remoto gana el hit test y la forma que hay debajo deja de ser
  // seleccionable. Es el caso central del producto: dos personas sobre la misma figura.
  const board = boardUrl(`e2e-cursor-hit-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  const [shape] = await shapesIn(a)
  const cx = shape!.x + shape!.w / 2
  const cy = shape!.y + shape!.h / 2 + 48

  // A deja su puntero justo encima de la forma; B lo recibe y lo pinta ahí.
  await a.mouse.move(cx, cy)
  await b.waitForFunction(() => (window.__canvas?.remoteCursorCount?.() ?? 0) > 0, undefined, {
    timeout: 5_000,
  })

  // B debe poder seleccionar la forma pese al cursor remoto encima.
  await b.mouse.click(cx, cy)
  await expect(b.getByTestId('tool-delete')).toBeEnabled()

  await a.close()
  await b.close()
})
