import { expect, test } from '@playwright/test'
import { boardUrl, shapesIn, waitForShapeCount } from './helpers.js'

test('crea las cuatro formas primitivas del MVP', async ({ page }) => {
  await page.goto(boardUrl(`e2e-create-${Date.now()}`))

  for (const tool of ['tool-rect', 'tool-ellipse', 'tool-text', 'tool-arrow']) {
    await page.getByTestId(tool).click()
  }
  await waitForShapeCount(page, 4)

  const types = (await shapesIn(page)).map((s) => s.type)
  expect(types.sort()).toEqual(['arrow', 'ellipse', 'rect', 'text'])
})

test('el círculo se crea como elipse con ancho y alto iguales', async ({ page }) => {
  await page.goto(boardUrl(`e2e-circle-${Date.now()}`))
  await page.getByTestId('tool-ellipse').click()
  await waitForShapeCount(page, 1)

  const [shape] = await shapesIn(page)
  expect(shape!.w).toBe(shape!.h)
})

test('la forma creada se propaga al segundo navegador', async ({ browser }) => {
  const board = boardUrl(`e2e-two-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  expect((await shapesIn(b))[0]!.type).toBe('rect')
  await a.close()
  await b.close()
})

test('borrar la forma seleccionada la elimina en ambos navegadores', async ({ browser }) => {
  const board = boardUrl(`e2e-del-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  const [shape] = await shapesIn(a)
  // Clic en el centro de la forma para seleccionarla antes de borrar.
  await a.mouse.click(shape!.x + shape!.w / 2, shape!.y + shape!.h / 2 + 48)
  await a.getByTestId('tool-delete').click()

  await waitForShapeCount(b, 0)
  // El test se llama "en ambos navegadores", así que también se comprueba el emisor: sin
  // esta aserción, un borrado que fallara en `a` pero cuyo update llegara igualmente a `b`
  // pasaría desapercibido.
  expect(await shapesIn(a)).toHaveLength(0)
  await a.close()
  await b.close()
})

test('la selección se limpia si otro cliente borra la forma seleccionada', async ({ browser }) => {
  const board = boardUrl(`e2e-selclear-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.getByTestId('tool-rect').click()
  await waitForShapeCount(b, 1)

  const [shape] = await shapesIn(a)
  await a.mouse.click(shape!.x + shape!.w / 2, shape!.y + shape!.h / 2 + 48)
  await expect(a.getByTestId('tool-delete')).toBeEnabled()

  // B borra la forma que A tiene seleccionada.
  // `waitForShapeCount` solo garantiza que el DOCUMENTO de B tiene la forma, no que Konva la
  // haya pintado. Sin esta espera el clic cae sobre el lienzo vacío, B no selecciona nada y
  // el test muere a los 30 s esperando a que se habilite "Borrar".
  await b.waitForFunction((id) => window.__canvas?.shapePosition?.(id) != null, shape!.id, {
    timeout: 5_000,
  })
  await b.mouse.click(shape!.x + shape!.w / 2, shape!.y + shape!.h / 2 + 48)
  await b.getByTestId('tool-delete').click()
  await waitForShapeCount(a, 0)

  await expect(a.getByTestId('tool-delete')).toBeDisabled()

  await a.close()
  await b.close()
})
