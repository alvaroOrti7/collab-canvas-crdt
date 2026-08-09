import type { Page } from '@playwright/test'
import type { Shape } from '@canvas/canvas-core'

export function boardUrl(boardId: string): string {
  return `/?board=${boardId}`
}

/** Lee el estado del documento desde el navegador, sin depender de píxeles. */
export async function shapesIn(page: Page): Promise<Shape[]> {
  // `!` justificado: quien llama a shapesIn ya esperó con waitForShapeCount, así que
  // readShapes está garantizado publicado en este punto.
  return page.evaluate(() => window.__canvas!.readShapes!())
}

export async function waitForShapeCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => (window.__canvas?.readShapes?.().length ?? -1) === expected,
    count,
    { timeout: 15_000 },
  )
}
