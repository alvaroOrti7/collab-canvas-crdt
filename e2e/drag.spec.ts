import { expect, test } from '@playwright/test'
import { boardUrl, shapesIn, waitForShapeCount } from './helpers.js'

test('arrastrar una forma propaga la posición final al otro navegador', async ({ browser }) => {
  const board = boardUrl(`e2e-drag-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  const [before] = await shapesIn(a)
  const startX = before!.x + before!.w / 2
  const startY = before!.y + before!.h / 2 + 48

  await a.mouse.move(startX, startY)
  await a.mouse.down()
  for (let step = 1; step <= 10; step++) {
    await a.mouse.move(startX + step * 20, startY + step * 10)
  }
  await a.mouse.up()

  await b.waitForFunction(
    // `readShapes` es opcional en el tipo de `window.__canvas` (Task 9), así que además de
    // `__canvas?.` hace falta `readShapes?.` antes de invocarla: sin el segundo `?.`,
    // TypeScript en modo estricto rechaza la llamada con TS2722 (no compila `pnpm typecheck`).
    (originalX) => (window.__canvas?.readShapes?.()[0]?.x ?? originalX) > originalX + 150,
    before!.x,
    { timeout: 10_000 },
  )

  const [afterA] = await shapesIn(a)
  const [afterB] = await shapesIn(b)
  expect(Math.round(afterB!.x)).toBe(Math.round(afterA!.x))
  expect(Math.round(afterB!.y)).toBe(Math.round(afterA!.y))

  await a.close()
  await b.close()
})

test('el gesto genera una sola escritura en el documento, no una por frame', async ({ page }) => {
  await page.goto(boardUrl(`e2e-batch-${Date.now()}`))
  await page.getByTestId('tool-rect').click()
  await waitForShapeCount(page, 1)

  const [shape] = await shapesIn(page)
  const startX = shape!.x + shape!.w / 2
  const startY = shape!.y + shape!.h / 2 + 48

  await page.evaluate(() => {
    window.__updateCount = 0
    window.__canvasDoc!.on('update', () => {
      window.__updateCount!++
    })
  })

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(startX + step * 10, startY)
    // Espaciados 15 ms: el gesto dura ~300 ms, unas siete ventanas de `DRAG_THROTTLE_MS`
    // (40 ms). Sin este espaciado, un refactor que moviera `updateShape` dentro del mismo
    // `if` del throttle en `onDragMove` cabría en 1-2 ventanas con movimientos sin pausa,
    // y el test lo daría por bueno con ese diseño roto.
    await page.waitForTimeout(15)
  }
  await page.mouse.up()

  const updates = await page.evaluate(() => window.__updateCount)
  // Con el gesto espaciado en ~7 ventanas de throttle, ese diseño roto produciría ~7
  // updates y caería contra este umbral. El commit único al soltar sigue dando 1.
  expect(updates).toBeLessThanOrEqual(3)
  // Y la cota inferior, que no es redundante: un arrastre completamente roto produce CERO
  // updates y pasaría solo con el `<=`. Ocurrió de verdad —este fue el único test de
  // drag.spec.ts que siguió verde mientras los otros cuatro caían.
  expect(updates).toBeGreaterThanOrEqual(1)
})

test('arrastrar una elipse la deja en su esquina esperada, no desplazada media caja', async ({ page }) => {
  // Konva posiciona la elipse por su centro; el modelo guarda la esquina de la caja. Si
  // algún handler propagara el centro sin convertir, la esquina final quedaría desplazada
  // medio ancho/alto respecto al desplazamiento real del ratón.
  await page.goto(boardUrl(`e2e-drag-ellipse-${Date.now()}`))
  await page.getByTestId('tool-ellipse').click()
  await waitForShapeCount(page, 1)

  const [before] = await shapesIn(page)
  const startX = before!.x + before!.w / 2
  const startY = before!.y + before!.h / 2 + 48
  const dx = 80
  const dy = 40

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(startX + (dx * step) / 8, startY + (dy * step) / 8)
  }
  await page.mouse.up()

  const [after] = await shapesIn(page)
  expect(Math.round(after!.x)).toBe(Math.round(before!.x + dx))
  expect(Math.round(after!.y)).toBe(Math.round(before!.y + dy))
})

test('mientras arrastra una elipse, awareness publica la esquina en curso, no el centro', async ({ page }) => {
  // `onDragEnd` lee `e.target.x()` fresco del nodo Konva al soltar, así que la posición
  // final es correcta pase lo que pase en `onDragMove`: no distingue si ese handler
  // convierte centro→esquina o no. Para probar de verdad la conversión hay que mirar lo
  // que se publicó en awareness a mitad del gesto, con el botón aún pulsado.
  await page.goto(boardUrl(`e2e-drag-ellipse-awareness-${Date.now()}`))
  await page.getByTestId('tool-ellipse').click()
  await waitForShapeCount(page, 1)

  const [shape] = await shapesIn(page)
  const startX = shape!.x + shape!.w / 2
  const startY = shape!.y + shape!.h / 2 + 48
  const dx = 80
  const dy = 40

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy)
  // Más de un DRAG_THROTTLE_MS (40 ms) para asegurar que el movimiento ya se publicó.
  await page.waitForTimeout(60)

  const dragging = await page.evaluate(() => window.__canvas!.localDragging!())
  await page.mouse.up()

  const published = dragging?.[shape!.id]
  expect(published).toBeDefined()
  expect(Math.round(published!.x)).toBe(Math.round(shape!.x + dx))
  expect(Math.round(published!.y)).toBe(Math.round(shape!.y + dy))
})

test('el otro cliente ve la forma moverse mientras se arrastra, no solo al soltar', async ({ browser }) => {
  const board = boardUrl(`e2e-livedrag-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  const [before] = await shapesIn(a)
  const startX = before!.x + before!.w / 2
  const startY = before!.y + before!.h / 2 + 48

  await a.mouse.move(startX, startY)
  await a.mouse.down()
  await a.mouse.move(startX + 200, startY)
  await a.waitForTimeout(60)

  // Con el botón AÚN pulsado: B debe estar viendo ya la posición provisional. Sin consumidor
  // del carril de awareness, aquí no habría nada y el test se cae por timeout.
  await b.waitForFunction(
    (id) => {
      const d = window.__canvas?.remoteDragging?.()
      return d != null && d[id] != null
    },
    before!.id,
    { timeout: 5_000 },
  )

  // Y ahora lo que de verdad importa: que la forma esté PINTADA en esa posición. Leer
  // `remoteDragging()` solo probaría que el dato llegó al puente — `CanvasStage` lo publica
  // directamente desde el hook, sin pasar por `ShapeNode`, así que un fallo de pintado no se
  // notaría. La posición del nodo de Konva es lo único que no se puede fingir.
  const painted = await b.evaluate((id) => window.__canvas!.shapePosition!(id), before!.id)
  expect(painted).not.toBeNull()
  expect(painted!.x).toBeGreaterThan(before!.x + 150)

  // Y el documento del receptor todavía NO se ha movido: es posición provisional, no commit.
  expect((await shapesIn(b))[0]!.x).toBe(before!.x)

  await a.mouse.up()
  await a.close()
  await b.close()
})
