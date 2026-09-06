# Correcciones tras la revisión final — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendada) o superpowers:executing-plans para implementar este plan tarea a tarea.
> Los pasos usan casillas (`- [ ]`) para seguimiento.

**Goal:** Dejar la rama `fase-0-sync-y-web` en estado fusionable: que la persistencia
funcione de verdad, que las dos promesas del spec que hoy no se cumplen (ver el arrastre en
vivo y los cursores suaves) pasen a cumplirse, y que los tests que las certifican
discriminen.

**Architecture:** Cinco tareas independientes. La primera es la única con decisión de
arquitectura —dónde se crean las filas de `boards`— y condiciona la fase 2, así que va
primero y sola. Las demás son correcciones acotadas al frontend y a los tests.

**Tech Stack:** El de la rama, sin dependencias nuevas: Hono, Drizzle, Hocuspocus 4.4, Yjs
13, React 19 + react-konva 19, Vite 8, Vitest 4, Playwright 1.62.

## Global Constraints

- **No añadir dependencias.** Todo lo necesario ya está en el repo.
- **No commitear.** En este proyecto commitea el usuario. Nada de `git commit`, `git push`
  ni `git add`. El trabajo se deja en el árbol.
- **TypeScript estricto** con `verbatimModuleSyntax`: imports de solo tipos con
  `import type`, rutas relativas con extensión `.js`.
- Símbolos en inglés; comentarios y documentación **en español**.
- **Comentarios: solo el POR QUÉ.** Nunca narrar lo que el código ya dice.
- **TDD:** el test primero, verlo fallar por el motivo correcto, implementación mínima,
  verlo pasar. Ejecutar de verdad y leer la salida.
- **Comandos:** `docker compose run --rm api pnpm <cmd>` para pnpm;
  `docker compose run --rm e2e corepack pnpm exec playwright test` para los E2E (esa imagen
  no trae `pnpm` en el PATH); `pnpm typecheck` **no** `pnpm -r typecheck` (`-r` excluye la
  raíz y se salta `typecheck:e2e`).
- **Estado de partida:** 29 tests unitarios y 14 E2E en verde. Cada tarea debe dejarlos en
  verde, más los suyos.

## Por qué estas correcciones y no otras

Salen de la revisión final de rama, que declaró la rama **no fusionable**. Cada una tiene un
escenario de fallo reproducido, no una sospecha. El detalle completo está en el ledger:
`.superpowers/sdd/2026-07-30-fases-0-1-andamio-y-mvp/progress.md`.

## File Structure

```
apps/api/src/routes/boards.ts     NUEVO — ruta para asegurar la existencia de un board
apps/api/src/app.ts               monta la ruta nueva
apps/api/test/boards.test.ts      NUEVO — tests de esa ruta
apps/sync/src/persistence.ts      `fetch` rechaza un board que no existe en `boards`
apps/sync/test/persistence.test.ts guarda del pool + test de board inexistente + snapshot real
apps/web/vite.config.ts           proxy de `/api`, además del de `/sync`
apps/web/src/canvas/useCanvasDoc.ts  asegura el board antes de abrir el WebSocket
apps/web/src/canvas/CanvasStage.tsx  capa de interacción, selección colgante, cursores desacoplados
apps/web/src/canvas/ShapeNode.tsx    acepta la posición provisional remota
apps/web/src/canvas/CursorOverlay.tsx  se suscribe por su cuenta; el lerp vuelve a aplicarse
apps/web/src/canvas/useRemotePresence.ts  no emite si nada cambió; expone también `dragging`
apps/web/src/canvas/useDragCommit.ts  limpieza granular y flush final del throttle
e2e/offline.spec.ts               aserción determinista en vez de carrera
packages/canvas-core/test/operations.test.ts  NUEVO — casos borde de las operaciones
```

---

### Task 1: C1 — que la persistencia funcione

**Files:**
- Create: `apps/api/src/routes/boards.ts`, `apps/api/test/boards.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/sync/src/persistence.ts`,
  `apps/sync/test/persistence.test.ts`, `apps/web/vite.config.ts`,
  `apps/web/src/canvas/useCanvasDoc.ts`, `compose.yaml`, `e2e/render.spec.ts`

**Interfaces:**
- Consumes: `createDb`, `boards`, `boardDocs`, `type Db` de `@canvas/schema`;
  `HealthDeps` de `apps/api/src/routes/health.ts`.
- Produces:
  - `boardsRoute(deps: { db: Db }): Hono` con `PUT /boards/:id` → `200 {"id": string}`
  - `ensureBoard(boardId: string): Promise<void>` en `useCanvasDoc.ts` (privada del módulo)
  - `fetch` de la persistencia lanza `Error` con mensaje que contiene `no existe` cuando el
    board no tiene fila en `boards`

**El problema, para que se entienda antes de tocar nada.** `board_docs.board_id` tiene una
clave foránea contra `boards.id`, y **nada en el producto crea filas en `boards`**: solo los
tests, a mano. Así que cada `store()` falla con violación de FK, Hocuspocus no descarga el
documento ("stays in memory to avoid data loss") y todo vive en la memoria de `sync`.
Reproducido: tras ejecutar los 14 E2E, `select count(*) from board_docs` devuelve 0.

**La decisión de diseño, y por qué no la obvia.** Lo tentador es que `sync` haga un upsert de
`boards` al cargar el documento. **No se hace así**: en la fase 2, con el WebSocket
autenticado, eso permitiría a cualquiera crear boards con solo conectarse. La creación
pertenece al `api`, que es quien tendrá el JWT, y `sync` se limita a **rechazar** lo que no
existe. Hoy el endpoint es abierto porque no hay autenticación todavía; en la fase 2 solo hay
que añadirle el guard, sin mover nada de sitio.

- [ ] **Step 1: Escribir el test de la ruta nueva**

Create `apps/api/test/boards.test.ts`:

```typescript
import { afterAll, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '@canvas/schema'
import { createApp } from '../src/app.js'
import type { Pool } from 'pg'

const BOARD = 'board-api-test'
let db: Db
let pool: Pool

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida: ejecuta el test dentro del contenedor')
  ;({ db, pool } = createDb(url))
  await db.execute(sql`DELETE FROM boards WHERE id = ${BOARD}`)
})

afterAll(async () => {
  await db.execute(sql`DELETE FROM boards WHERE id = ${BOARD}`)
  // Guarda: si beforeAll falló, `pool` es undefined y sin esto el TypeError taparía el error real.
  if (pool) await pool.end()
})

const app = () => createApp({ db, redis: { ping: async () => 'PONG' } })

test('crea el board si no existía', async () => {
  const res = await app().request(`/boards/${BOARD}`, { method: 'PUT' })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ id: BOARD })

  const rows = await db.execute(sql`SELECT id FROM boards WHERE id = ${BOARD}`)
  expect(rows.rows).toHaveLength(1)
})

test('es idempotente: llamarlo dos veces no duplica ni falla', async () => {
  await app().request(`/boards/${BOARD}`, { method: 'PUT' })
  const res = await app().request(`/boards/${BOARD}`, { method: 'PUT' })

  expect(res.status).toBe(200)
  const rows = await db.execute(sql`SELECT id FROM boards WHERE id = ${BOARD}`)
  expect(rows.rows).toHaveLength(1)
})

test('rechaza un id vacío', async () => {
  const res = await app().request('/boards/%20', { method: 'PUT' })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Ejecutar y verlo fallar**

Run: `docker compose run --rm api pnpm --filter api test`
Expected: FAIL — la ruta no existe, así que Hono devuelve 404 y el primer `expect` falla.

- [ ] **Step 3: Escribir la ruta**

Create `apps/api/src/routes/boards.ts`:

```typescript
import { Hono } from 'hono'
import { boards, type Db } from '@canvas/schema'

export interface BoardsDeps {
  db: Db
}

/**
 * `PUT` y no `POST` porque es idempotente: abrir el mismo board dos veces no debe fallar ni
 * duplicar. La creación vive aquí y no en `sync` a propósito — en la fase 2 este endpoint
 * llevará el guard de autenticación, mientras que un upsert desde el WebSocket dejaría que
 * cualquiera creara boards con solo conectarse.
 */
export function boardsRoute(deps: BoardsDeps): Hono {
  const route = new Hono()

  route.put('/boards/:id', async (c) => {
    const id = c.req.param('id').trim()
    if (!id) return c.json({ error: 'el id del board no puede estar vacío' }, 400)

    await deps.db
      .insert(boards)
      .values({ id, title: id })
      .onConflictDoNothing({ target: boards.id })

    return c.json({ id })
  })

  return route
}
```

- [ ] **Step 4: Montar la ruta en la app**

Modify `apps/api/src/app.ts`, entero:

```typescript
import { Hono } from 'hono'
import { healthRoute, type HealthDeps } from './routes/health.js'
import { boardsRoute } from './routes/boards.js'

export function createApp(deps: HealthDeps): Hono {
  const app = new Hono()
  app.route('/', healthRoute(deps))
  app.route('/', boardsRoute({ db: deps.db }))
  return app
}
```

- [ ] **Step 5: Ejecutar y verlo pasar**

Run: `docker compose run --rm api pnpm --filter api test`
Expected: PASS, 6 tests (3 de health + 3 de boards).

- [ ] **Step 6: Escribir el test que reproduce C1**

Este es el test que faltaba y por el que el fallo atravesó trece revisiones: los tres tests
actuales de persistencia insertan la fila de `boards` a mano, o sea que verifican `store()`
bajo una precondición que el producto nunca cumple.

Modify `apps/sync/test/persistence.test.ts`. Añade al final:

```typescript
test('un board que no existe en boards se rechaza en vez de fallar al guardar', async () => {
  const persistence = createPersistence(db)

  // Sin fila en `boards`, guardar violaría la FK y Hocuspocus dejaría el documento en
  // memoria para siempre. Es preferible rechazar la carga: el fallo se ve de inmediato en
  // vez de manifestarse como pérdida de datos en el siguiente reinicio.
  await expect(
    persistence.configuration.fetch({ documentName: 'board-que-no-existe' } as never),
  ).rejects.toThrow(/no existe/)
})
```

Y arregla la guarda del `afterAll` en ese mismo fichero: sustituye `await pool.end()` por

```typescript
  // Si beforeAll falló, `pool` es undefined y el TypeError taparía el error real —que es
  // justo el de conexión a la base de datos que interesa leer.
  if (pool) await pool.end()
```

- [ ] **Step 7: Ejecutar y verlo fallar**

Run: `docker compose run --rm sync pnpm --filter sync test`
Expected: FAIL — hoy `fetch` devuelve `null` para un board inexistente en vez de lanzar.

- [ ] **Step 8: Hacer que `fetch` rechace lo que no existe**

Modify `apps/sync/src/persistence.ts`. Sustituye el `fetch` entero:

```typescript
    // Tres respuestas distintas, y la diferencia importa:
    //   - el board no existe en `boards`      -> lanza: la conexión se rechaza
    //   - existe pero no tiene snapshot        -> null: documento nuevo legítimo
    //   - existe y tiene snapshot ilegible     -> lanza (assertLoadable)
    // Sin la primera, `store` violaría la FK en cada intento, Hocuspocus dejaría el
    // documento en memoria indefinidamente y nada se persistiría jamás.
    fetch: async ({ documentName }) => {
      const board = await db
        .select({ id: boards.id })
        .from(boards)
        .where(eq(boards.id, documentName))
        .limit(1)

      if (!board[0]) throw new Error(`el board "${documentName}" no existe`)

      const rows = await db
        .select({ ydoc: boardDocs.ydoc })
        .from(boardDocs)
        .where(eq(boardDocs.boardId, documentName))
        .limit(1)

      const stored = rows[0]?.ydoc
      return stored ? assertLoadable(documentName, stored) : null
    },
```

Y añade `boards` al import de `@canvas/schema`:

```typescript
import { boardDocs, boards, type Db } from '@canvas/schema'
```

- [ ] **Step 9: Ejecutar y verlo pasar**

Run: `docker compose run --rm sync pnpm --filter sync test`
Expected: PASS, 4 tests.

- [ ] **Step 10: Proxear el `api` desde Vite**

El cliente tiene que llamar al `api`, y una url absoluta no vale: el navegador de Playwright
vive dentro de un contenedor donde `localhost` es él mismo. Es el mismo problema que ya se
resolvió con `/sync`, y la solución es la misma.

Modify `apps/web/vite.config.ts`, dentro de `server.proxy`, junto al bloque de `/sync`:

```typescript
      '/api': {
        target: 'http://api:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
```

- [ ] **Step 11: Asegurar el board antes de abrir el WebSocket**

Modify `apps/web/src/canvas/useCanvasDoc.ts`. Añade antes del `useEffect` que crea el
provider:

```typescript
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
```

Y envuelve la creación del provider para que espere a eso. Sustituye el cuerpo del
`useEffect` que hoy empieza con `const next = new HocuspocusProvider({` por:

```typescript
    let next: HocuspocusProvider | null = null
    let cancelled = false

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
```

En la función de limpieza del efecto, sustituye `next.destroy()` por:

```typescript
      cancelled = true
      next?.destroy()
```

- [ ] **Step 12: Verificar el ciclo completo de verdad**

Esta es la comprobación que importa: que un board recién abierto acabe en `board_docs`.

```bash
docker compose down -v && docker compose up -d
docker compose run --rm api pnpm --filter @canvas/schema db:migrate
docker compose run --rm e2e corepack pnpm exec playwright test create-shapes
docker run --rm alpine sleep 6
docker compose exec -T postgres psql -U canvas -d canvas -c 'select board_id, length(ydoc) from board_docs;'
```

Expected: **al menos una fila con bytes > 0**. Antes de esta tarea, cero. Pega la salida en
el informe: es la prueba de que C1 está resuelto.

- [ ] **Step 13: Arreglar el test que sembraba saltándose el `api`**

`e2e/render.spec.ts` conecta un `HocuspocusProvider` en crudo contra `sync` para sembrar una
forma, sin pasar nunca por el endpoint de boards. Eso funcionaba porque `sync` aceptaba
cualquier `documentName`, y es **exactamente el patrón que esta tarea cierra**: el test se
salta la única vía legítima de crear un board. Con el rechazo puesto, esa conexión falla —
correctamente.

El test tiene que hacer lo mismo que hace el cliente real: asegurar el board antes de
conectar. Desde el contenedor `e2e` se llega al servicio por su nombre de red, no por
`localhost`.

Modify `compose.yaml`, en el bloque `environment` del servicio `e2e`, junto a `SYNC_URL`:

```yaml
      API_URL: http://api:3001
```

Modify `e2e/render.spec.ts`, justo antes de crear el `HocuspocusProvider`:

```typescript
  // El servidor de sincronización rechaza un board sin fila en `boards`, así que este
  // cliente sembrador tiene que asegurarlo igual que hace la aplicación. Antes no hacía
  // falta porque `sync` aceptaba cualquier nombre de documento: justamente el agujero que
  // esta tarea cierra.
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  const ensured = await fetch(`${apiUrl}/boards/${encodeURIComponent(BOARD)}`, { method: 'PUT' })
  expect(ensured.ok).toBe(true)
```

- [ ] **Step 14: Declarar la dependencia real de `e2e` sobre `api`**

Desde esta tarea, los tests E2E necesitan que `api` esté arriba: `render.spec.ts` lo llama
directamente y cualquier board abierto desde el navegador pasa por él. El servicio lo
declara `depends_on` sobre `web` y `sync` pero no sobre `api`.

Modify `compose.yaml`, en el `depends_on` del servicio `e2e`, añade `- api` a la lista.

- [ ] **Step 15: Sin regresiones**

Run: `docker compose run --rm api pnpm -r test` → 33 tests (29 + 3 de boards + 1 de sync).
Run: `docker compose run --rm e2e corepack pnpm exec playwright test` → 14 en verde.
Run: `docker compose run --rm api pnpm typecheck` → limpio.

---

### Task 2: I1 e I4 — que se vea el arrastre en vivo sin repintar el lienzo

**Files:**
- Modify: `apps/web/src/canvas/useRemotePresence.ts`,
  `apps/web/src/canvas/useDragCommit.ts`, `apps/web/src/canvas/CanvasStage.tsx`,
  `apps/web/src/canvas/ShapeNode.tsx`
- Test: `e2e/drag.spec.ts`

**Interfaces:**
- Consumes: `Presence` de `@canvas/canvas-core`; `RemoteCursor` de `useRemotePresence.ts`.
- Produces:
  - `useRemotePresence(provider)` pasa a devolver `{ cursors: RemoteCursor[]; dragging: Record<ShapeId, {x,y}> }`
  - `ShapeNode` acepta `remotePosition?: { x: number; y: number }`

**El problema.** `useDragCommit` publica la posición provisional en `Presence.dragging`, con
throttle y con la conversión centro→esquina de la elipse. Todo eso funciona. Pero **nadie
lee ese campo**: `useRemotePresence` solo mira `cursor`. Así que quien arrastra ve su forma
moverse y los demás no ven **nada** hasta que suelta, y entonces la forma teletransporta.
§5.2 del spec pide literalmente "los demás ven el movimiento en vivo", y es la mitad del
valor del diseño de tres carriles.

Dos minors aparcados entran aquí porque hoy son invisibles **solo** porque nadie lee el
campo, y dejan de serlo en cuanto alguien lo lea.

- [ ] **Step 1: Escribir el test E2E que falla**

Añade a `e2e/drag.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Añadir al puente `remoteDragging` y la posición pintada**

Modify `apps/web/src/global.d.ts`, dentro de la declaración de `__canvas`:

```typescript
      remoteDragging?: () => Record<string, { x: number; y: number }>
      /** Posición real del nodo de Konva, para poder afirmar sobre lo pintado y no sobre el dato. */
      shapePosition?: (id: string) => { x: number; y: number } | null
```

Y en `apps/web/src/canvas/CanvasStage.tsx`, junto a los otros efectos del puente:

```typescript
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = {
      ...window.__canvas!,
      // `ShapeNode` asigna `id: shape.id` al nodo, así que se puede localizar por selector.
      shapePosition: (id: string) => {
        const node = stageRef.current?.findOne(`#${id}`)
        return node ? { x: node.x(), y: node.y() } : null
      },
    }
  }, [])
```

- [ ] **Step 3: Ejecutar y verlo fallar**

Run: `docker compose run --rm e2e corepack pnpm exec playwright test drag`
Expected: FAIL por timeout en el `waitForFunction` — `remoteDragging` no existe.

- [ ] **Step 4: Que `useRemotePresence` exponga también el arrastre**

Modify `apps/web/src/canvas/useRemotePresence.ts`. Cambia el tipo de retorno y el cuerpo del
`read`:

```typescript
export interface RemotePresence {
  cursors: RemoteCursor[]
  /** Posiciones provisionales de formas que otros están arrastrando ahora mismo. */
  dragging: Record<string, { x: number; y: number }>
}
```

Dentro de `read`, junto al acumulador `next`, añade `const drags: RemotePresence['dragging'] = {}`
y dentro del bucle, después del bloque de `state?.cursor`:

```typescript
        if (state?.dragging) Object.assign(drags, state.dragging)
```

Y sustituye el `setCursors(...)` final por:

```typescript
      const visible = next.filter((c) => !stale.has(c.clientId))
      setPresence((prev) => (samePresence(prev, visible, drags) ? prev : { cursors: visible, dragging: drags }))
```

Renombra el estado a `const [presence, setPresence] = useState<RemotePresence>({ cursors: [], dragging: {} })`
y devuelve `presence`. Añade arriba el comparador:

```typescript
/**
 * Devolver el mismo objeto cuando nada cambió evita re-renderizar el árbol entero de formas
 * en cada evento de awareness — y `setLocalState` emite uno también para el propio cliente,
 * así que sin esto un solo usuario moviendo el ratón ya reconciliaría todo a 25 Hz.
 */
function samePresence(
  prev: RemotePresence,
  cursors: RemoteCursor[],
  dragging: RemotePresence['dragging'],
): boolean {
  if (prev.cursors.length !== cursors.length) return false
  for (let i = 0; i < cursors.length; i++) {
    const a = prev.cursors[i]!
    const b = cursors[i]!
    if (a.clientId !== b.clientId || a.x !== b.x || a.y !== b.y || a.name !== b.name || a.color !== b.color) {
      return false
    }
  }
  const prevKeys = Object.keys(prev.dragging)
  const nextKeys = Object.keys(dragging)
  if (prevKeys.length !== nextKeys.length) return false
  return nextKeys.every((k) => {
    const a = prev.dragging[k]
    const b = dragging[k]!
    return a != null && a.x === b.x && a.y === b.y
  })
}
```

- [ ] **Step 5: Limpieza granular y flush final en `useDragCommit`**

Los dos minors que entran aquí. Modify `apps/web/src/canvas/useDragCommit.ts`:

**Solo la limpieza granular.** El otro minor aparcado —el flush de la última posición al
soltar— **no se implementa, y es deliberado**: `onDragEnd` ya escribe la posición final en el
documento antes de limpiar `dragging`, así que el observador pasa de la provisional a la
definitiva sin hueco. Lo único que se pierde son hasta 40 ms de una posición intermedia que
queda inmediatamente superada. Añadir maquinaria de flush para eso sería complejidad sin
beneficio observable.

En `onDragEnd`, sustituye la limpieza por (conservando el `lastPublished.current = 0` que ya
está ahí, que es lo que evita que el throttle heredado se coma la primera posición del gesto
siguiente):

```typescript
      // Se borra solo la clave de esta forma, no el objeto entero: limpiar todo perdería el
      // estado de cualquier otro arrastre en curso del mismo cliente.
      const current = (provider?.awareness?.getLocalState() as Presence | null)?.dragging ?? {}
      const { [id]: _removed, ...rest } = current
      provider?.awareness?.setLocalStateField('dragging', Object.keys(rest).length ? rest : null)
      pending.current = null
```

- [ ] **Step 6: Pintar la posición provisional**

Modify `apps/web/src/canvas/ShapeNode.tsx`. Añade a `ShapeNodeProps`:

```typescript
  /** Posición provisional publicada por otro cliente que está arrastrando esta forma. */
  remotePosition?: { x: number; y: number }
```

Y al principio del componente, antes de `common`:

```typescript
  // Mientras otro arrastra, se pinta su posición provisional; el documento todavía no la
  // tiene, porque el commit ocurre al soltar.
  const x = remotePosition?.x ?? shape.x
  const y = remotePosition?.y ?? shape.y
```

Sustituye `shape.x`/`shape.y` por `x`/`y` en los cuatro casos del `switch` (incluidas las
conversiones de centro de la elipse, que pasan a ser `x + shape.w / 2` e `y + shape.h / 2`).

- [ ] **Step 7: Conectarlo en `CanvasStage`**

Modify `apps/web/src/canvas/CanvasStage.tsx`:

- Cambia `const cursors = useRemotePresence(provider)` por
  `const { cursors, dragging } = useRemotePresence(provider)`
- Pasa a cada `<ShapeNode>`: `remotePosition={dragging[shape.id]}`
- Añade el puente, junto a los otros dos `useEffect` de `window.__canvas`:

```typescript
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = { ...window.__canvas!, remoteDragging: () => dragging }
  }, [dragging])
```

- [ ] **Step 8: Ejecutar y verlo pasar**

Run: `docker compose run --rm e2e corepack pnpm exec playwright test drag`
Expected: PASS, 4 tests de `drag.spec.ts`.

- [ ] **Step 9: Demostrar que el test discrimina**

Quita temporalmente `remotePosition={dragging[shape.id]}` de `CanvasStage`, ejecuta el test
nuevo, **comprueba que falla**, y revierte. Sin esa evidencia no consta que el test sirva.
Incluye la salida del rojo en el informe.

- [ ] **Step 10: Sin regresiones**

Run: `docker compose run --rm e2e corepack pnpm exec playwright test` → 15 en verde.
Run: `docker compose run --rm api pnpm -r test` → 32.
Run: `docker compose run --rm api pnpm typecheck` → limpio.

---

### Task 3: I2 — que los cursores se muevan suaves de verdad

**Files:**
- Modify: `apps/web/src/canvas/CursorOverlay.tsx`

**Interfaces:**
- Consumes: `RemoteCursor` de `useRemotePresence.ts`.
- Produces: nada nuevo; `CursorOverlay` mantiene su firma `{ cursors: RemoteCursor[] }`.

**El problema.** `CursorOverlay` pasa `x={cursor.x} y={cursor.y}` como props del `Group` **y
además** intenta interpolar hacia esa misma posición en un bucle `requestAnimationFrame`.
react-konva aplica la prop en cuanto cambia, así que el nodo salta directo al destino; cuando
corre el `tick`, `group.x()` ya es igual a `target.x` y el lerp mueve exactamente cero. Los
cursores van a saltos de 25 Hz, justo lo que §5.4 dice evitar.

Además el bucle sigue corriendo indefinidamente aunque no haya ni un cursor.

- [ ] **Step 1: Quitar las props que anulan la interpolación**

Modify `apps/web/src/canvas/CursorOverlay.tsx`. En el `<Group>` del `map`, **elimina**
`x={cursor.x}` e `y={cursor.y}`, y coloca la posición inicial en el ref callback para que un
cursor nuevo no nazca en el origen y se deslice desde ahí:

```typescript
          ref={(node) => {
            if (node) {
              // Posición inicial directa: sin esto el cursor nacería en (0,0) y se vería
              // deslizarse hasta su sitio la primera vez que aparece.
              if (!groups.current.has(cursor.clientId)) node.position({ x: cursor.x, y: cursor.y })
              groups.current.set(cursor.clientId, node)
            } else {
              groups.current.delete(cursor.clientId)
              targets.current.delete(cursor.clientId)
            }
          }}
```

Fíjate en el `targets.current.delete`: hoy ese mapa nunca se limpia y crece con cada cliente
visto en la sesión.

- [ ] **Step 2: Parar el bucle cuando no hay a quién mover**

En el `useEffect` del bucle, cambia la dependencia `[]` por `[cursors.length]` y sal pronto:

```typescript
  useEffect(() => {
    if (cursors.length === 0) return
    let frame = 0
    // ... el tick tal cual ...
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [cursors.length])
```

Y ajusta el comentario de cabecera del componente para que explique **por qué** la posición
no va en las props:

```typescript
/**
 * Awareness llega a ~25 Hz y la pantalla pinta a 60: sin interpolación los cursores van a
 * saltos. Un único bucle rAF para todos, no uno por cursor.
 *
 * La posición NO se pasa como prop del Group a propósito: react-konva la aplicaría en cuanto
 * cambia, el nodo saltaría al destino y el lerp de abajo movería exactamente cero. El bucle
 * es el único que mueve estos nodos.
 */
```

- [ ] **Step 3: Verificar que interpola de verdad**

No hay forma limpia de aserción E2E sobre la suavidad, así que la comprobación es manual y va
en el informe. Con dos ventanas en el mismo board, mueve el ratón en una y observa la otra:
el cursor debe seguir el movimiento con un ligero retraso continuo, no a saltos.

**Si se te ocurre una forma honesta de afirmar sobre la interpolación, impleméntala.** La
vía razonable es exponer en el puente de test la posición real del nodo de Konva y comprobar
que, 30 ms después de un salto grande del cursor remoto, está **entre** el origen y el
destino — no en el destino. Si no encuentras una forma que discrimine de verdad, **no
escribas ningún test**: deja solo la verificación manual en el informe. En este proyecto ya
se colaron seis tests que pasaban sin probar lo que prometían; añadir un séptimo para
aparentar cobertura sería el peor desenlace posible.

- [ ] **Step 4: Quitar el margen del `<body>`**

El test de interpolación destapó un bug real de la aplicación: el `<body>` conserva su
margen de 8 px por defecto —no hay ningún reset en el proyecto— mientras el `<Stage>` se
dimensiona a `window.innerWidth` × `window.innerHeight - 48`. Consecuencias: el lienzo
**sobresale 8 px por la derecha y por abajo provocando scroll**, y todo el sistema de
coordenadas queda desplazado (medido: un puntero en la página en `(150, 198)` acaba en
`(142, 142)` dentro del Stage, no en `(150, 150)`).

Los demás E2E no lo detectaban porque hacen clic en el centro de formas de 160×100, donde
8 px no cambian el resultado.

Modify `apps/web/index.html`, dentro de `<head>`:

```html
    <style>
      /* El Stage se dimensiona a la ventana completa, así que cualquier margen en el body
         lo hace sobresalir y desplaza el sistema de coordenadas del lienzo. */
      body { margin: 0 }
    </style>
```

Tras el cambio, un puntero en `(150, 198)` de la página debe corresponder a `(150, 150)` en
coordenadas del Stage, y el test de interpolación debe pasar sin tocar sus tolerancias.

- [ ] **Step 5: Sin regresiones**

Run: `docker compose run --rm e2e corepack pnpm exec playwright test` → todos en verde.
Run: `docker compose run --rm api pnpm typecheck` → limpio.

---

### Task 4: I3 y la selección colgante

**Files:**
- Modify: `apps/web/src/canvas/CanvasStage.tsx`

**Interfaces:**
- Consumes: `ShapeId`, `Shape` de `@canvas/canvas-core`.
- Produces: nada nuevo.

**Los dos problemas.**

`layer-interaction` está montada pero **vacía**, y la forma que se arrastra nunca sale de
`layer-static`. Konva ≥ 8 no tiene capa de arrastre automática, así que arrastrar una forma
**repinta la capa estática entera a 60 fps** — exactamente lo que §5.3 divide las capas para
evitar. Con 300 formas en el board, se repintan las 300 en cada frame.

Y el minor de la selección: si otro cliente borra la forma que tú tienes seleccionada,
`selected` sigue apuntando a un id que ya no existe y el botón "Borrar" queda habilitado sin
hacer nada. Es un caso de dos usuarios, que es el caso de uso central del producto.

- [ ] **Step 1: Llevar la forma arrastrada a la capa de interacción**

Modify `apps/web/src/canvas/CanvasStage.tsx`. Añade el estado y los handlers:

```typescript
  const [draggingId, setDraggingId] = useState<ShapeId | null>(null)
```

En el render, reparte las formas entre las dos capas:

```typescript
        <Layer name="layer-static">
          {shapes
            .filter((shape) => shape.id !== draggingId)
            .map((shape) => (
              <ShapeNode
                key={shape.id}
                shape={shape}
                selected={shape.id === selected}
                onSelect={setSelected}
                draggable
                remotePosition={dragging[shape.id]}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ))}
        </Layer>
        <Layer name="layer-interaction">
          {shapes
            .filter((shape) => shape.id === draggingId)
            .map((shape) => (
              <ShapeNode
                key={shape.id}
                shape={shape}
                selected={shape.id === selected}
                onSelect={setSelected}
                draggable
                remotePosition={dragging[shape.id]}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ))}
        </Layer>
```

Y envuelve los handlers del drag para que marquen y desmarquen la forma activa:

```typescript
  // La forma que se arrastra se mueve a `layer-interaction` mientras dura el gesto: si se
  // quedara en `layer-static`, cada frame repintaría todas las formas del board.
  const handleDragMove = useCallback(
    (id: ShapeId, x: number, y: number) => {
      setDraggingId(id)
      drag.onDragMove(id, x, y)
    },
    [drag],
  )

  const handleDragEnd = useCallback(
    (id: ShapeId, x: number, y: number) => {
      drag.onDragEnd(id, x, y)
      setDraggingId(null)
    },
    [drag],
  )
```

- [ ] **Step 2: Limpiar la selección cuando la forma desaparece**

Añade junto a los otros efectos:

```typescript
  // Si otro cliente borra la forma seleccionada, `selected` apuntaría a un id inexistente y
  // el botón de borrar seguiría habilitado sin hacer nada.
  useEffect(() => {
    if (selected && !shapes.some((shape) => shape.id === selected)) setSelected(null)
  }, [shapes, selected])
```

- [ ] **Step 3: Escribir el test de la selección colgante**

Añade a `e2e/create-shapes.spec.ts`:

```typescript
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
  await b.mouse.click(shape!.x + shape!.w / 2, shape!.y + shape!.h / 2 + 48)
  await b.getByTestId('tool-delete').click()
  await waitForShapeCount(a, 0)

  await expect(a.getByTestId('tool-delete')).toBeDisabled()

  await a.close()
  await b.close()
})
```

- [ ] **Step 4: Ejecutar todo**

Run: `docker compose run --rm e2e corepack pnpm exec playwright test`
Expected: todos en verde, incluido el nuevo.
Run: `docker compose run --rm api pnpm typecheck` → limpio.

---

### Task 5: I5, I6 y los casos borde sin cubrir

**Files:**
- Modify: `apps/sync/test/persistence.test.ts`, `e2e/offline.spec.ts`
- Create: `packages/canvas-core/test/operations.test.ts`

**Interfaces:**
- Consumes: `addShape`, `updateShape`, `deleteShapes`, `readShape`, `readShapes` de
  `@canvas/canvas-core`.
- Produces: nada nuevo.

**Los tres problemas.** El test del snapshot solo comprueba `byteLength > 0`, que pasaría
igual persistiendo un documento vacío (`Y.encodeStateAsUpdate(new Y.Doc())` son 2 bytes). El
test de offline afirma el negativo (`b` no tiene la forma) **inmediatamente**, así que si el
corte de red no funcionara la aserción pasaría o fallaría según el planificador. Y el no-op
de `updateShape` sobre una forma borrada —que es una decisión CRDT deliberada— no tiene ni un
test.

- [ ] **Step 1: Que el test del snapshot compruebe el contenido**

Modify `apps/sync/test/persistence.test.ts`, en el test "el snapshot queda escrito en
board_docs". Sustituye la aserción de `byteLength` por:

```typescript
  // `byteLength > 0` pasaría persistiendo un documento vacío: encodeStateAsUpdate de un
  // Y.Doc recién creado ya son 2 bytes. Lo que hay que comprobar es que el snapshot
  // contiene la forma.
  const restored = new Y.Doc()
  Y.applyUpdate(restored, new Uint8Array(rows.rows[0]!.ydoc as Buffer))
  expect(restored.getMap('shapes').get('s1')).toBe('rectangulo')
```

- [ ] **Step 2: Que el test de offline no dependa de una carrera**

Modify `e2e/offline.spec.ts`. Sustituye `expect(await shapesIn(b)).toHaveLength(1)` por:

```typescript
  // Espera deliberada antes de afirmar el negativo: sin ella, si `setOffline` no tuviera
  // efecto, el update de A llegaría a B en pocos milisegundos y esta aserción pasaría o
  // fallaría según el planificador. Es la única línea que distingue "el aislamiento
  // funciona" de "todo iba conectado".
  await b.waitForTimeout(1_000)
  expect(await shapesIn(b)).toHaveLength(1)
```

- [ ] **Step 3: Escribir los casos borde de las operaciones**

Create `packages/canvas-core/test/operations.test.ts`:

```typescript
import { expect, test } from 'vitest'
import * as Y from 'yjs'
import { addShape, deleteShapes, updateShape } from '../src/operations.js'
import { readShape, readShapes } from '../src/selectors.js'

test('actualizar una forma inexistente no crea nada ni lanza', () => {
  const doc = new Y.Doc()
  updateShape(doc, 'no-existe', { x: 10 })
  expect(readShapes(doc)).toEqual([])
})

test('actualizar una forma borrada no la resucita', () => {
  const doc = new Y.Doc()
  const id = addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'doomed')
  deleteShapes(doc, [id])

  updateShape(doc, id, { x: 999 })

  expect(readShape(doc, id)).toBeNull()
  expect(readShapes(doc)).toEqual([])
})

test('un patch con undefined explícito no pisa el valor existente', () => {
  const doc = new Y.Doc()
  const id = addShape(doc, { type: 'rect', x: 42, y: 7, w: 10, h: 10 }, 'shape-1')

  updateShape(doc, id, { x: undefined, y: 99 })

  const shape = readShape(doc, id)
  expect(shape?.x).toBe(42)
  expect(shape?.y).toBe(99)
})

test('borrar una lista con ids inexistentes no afecta a los que sí existen', () => {
  const doc = new Y.Doc()
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'vive')
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'muere')

  deleteShapes(doc, ['muere', 'nunca-existió'])

  expect(readShapes(doc).map((s) => s.id)).toEqual(['vive'])
})
```

- [ ] **Step 4: Ejecutar todo**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test` → 23 tests (19 + 4).
Run: `docker compose run --rm sync pnpm --filter sync test` → 4.
Run: `docker compose run --rm api pnpm -r test` → 36.
Run: `docker compose run --rm e2e corepack pnpm exec playwright test` → todos en verde.
Run: `docker compose run --rm api pnpm typecheck` → limpio.

---

## Verificación de cierre

Ejecuta esto y **lee la salida** antes de dar nada por terminado:

- [ ] `docker compose down -v && docker compose up -d` y aplicar migraciones desde cero
- [ ] `docker compose run --rm api pnpm -r test` → 36 tests
- [ ] `docker compose run --rm e2e corepack pnpm exec playwright test` → 17 E2E
- [ ] `docker compose run --rm api pnpm typecheck` → sin errores
- [ ] **La prueba de que C1 está resuelto:** dibujar en el navegador, esperar 6 s, y
      `select board_id, length(ydoc) from board_docs` devuelve al menos una fila con bytes
- [ ] **La prueba de que el reinicio ya no pierde datos:** `docker compose restart sync`,
      recargar el navegador, y la forma sigue ahí
- [ ] Dos ventanas en el mismo board: al arrastrar en una, la otra ve el movimiento **durante**
      el gesto; los cursores se mueven con continuidad, no a saltos

## Fuera de alcance

Los 12 minors que la revisión final marcó como "puede esperar" siguen aparcados y están en el
ledger. En particular, tres que conviene tener presentes al empezar la fase 2:

- La identidad (`name`, `color`) la publica hoy el propio cliente; con login habría que
  tomarla del token que valida `sync`.
- El proxy de `/sync` y `/api` existe solo en el servidor de desarrollo de Vite: el
  despliegue necesita reponer ese enrutado en Caddy o Traefik.
- `server.ts` parsea la URL de Redis a mano y descarta usuario, contraseña y TLS.
