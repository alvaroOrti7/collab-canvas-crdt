# Lienzo colaborativo CRDT — Plan de implementación de las fases 0 y 1

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea.
> Los pasos usan casillas (`- [ ]`) para seguimiento.

**Goal:** Levantar el monorepo contenedorizado con cinco servicios y entregar un lienzo
colaborativo funcional donde dos navegadores dibujan las cuatro formas primitivas, las
mueven sin conflicto y ven los cursores del otro interpolados.

**Architecture:** Monorepo pnpm con tres apps (`web`, `api`, `sync`) y dos paquetes
(`canvas-core`, `schema`). Toda la lógica de documento vive en `canvas-core`, sin React ni
Konva, para poder verificar la convergencia CRDT en Node puro. El servidor de sync es
Hocuspocus con persistencia en Postgres. El desarrollo ocurre íntegramente dentro de
contenedores en OrbStack.

**Tech Stack:** Node 24 LTS · TypeScript 7 · pnpm workspaces · Yjs 13 · Hocuspocus 4.4 ·
Hono 4 · Drizzle · Postgres 18.4 · Redis 8.8.1 · Vite 8 · React 19 · react-konva 19 ·
Vitest 4 · Playwright 1.62

**Spec de referencia:** [`docs/superpowers/specs/2026-07-30-lienzo-colaborativo-crdt-design.md`](../specs/2026-07-30-lienzo-colaborativo-crdt-design.md)

## Global Constraints

Estas reglas aplican a **todas** las tareas. Los requisitos de cada tarea las incluyen
implícitamente.

- **Versiones exactas verificadas el 2026-07-30.** Fíjalas sin rango (`"yjs": "13.6.31"`,
  no `"^13.6.31"`) en fase 0; los rangos se relajan cuando haya CI:
  `yjs@13.6.31` · `y-protocols@1.0.7` · `@hocuspocus/server@4.4.0` ·
  `@hocuspocus/extension-database@4.4.0` · `@hocuspocus/extension-redis@4.4.0` ·
  `@hocuspocus/provider@4.4.0` · `fractional-indexing@4.0.0` · `hono@4.12.32` ·
  `@hono/node-server@2.0.12` · `react@19.2.8` · `react-dom@19.2.8` ·
  `react-konva@19.2.5` · `konva@10.3.0` · `vite@8.2.0` · `vitest@4.1.10` ·
  `drizzle-orm@0.45.2` · `drizzle-kit@0.31.10` · `pg@8.22.0` ·
  `@playwright/test@1.62.1` · `typescript@7.0.2`
- **Paridad estricta React ↔ react-konva.** `react-konva@19.x` exige `react@>=19.2`. Si
  actualizas uno, actualizas el otro en el mismo commit.
- **Imágenes base:** `node:24-bookworm-slim`, `postgres:18.4-alpine`,
  `redis:8.8.1-alpine`. Los tres tags están verificados como existentes.
- **Nunca ejecutes `pnpm` en el host.** El host no tiene Node instalado y así se queda:
  todo comando de Node corre dentro del contenedor. Es también la razón por la que
  `node_modules` puede vivir en el bind mount sin conflictos de binarios nativos.
- **TypeScript estricto:** `"strict": true`, `"module": "nodenext"`,
  `"target": "es2023"`, `"noUncheckedIndexedAccess": true`.
- **`canvas-core` no importa React, Konva, ni nada del DOM.** Es la regla que hace
  testeable la convergencia y la que mantiene el renderer sustituible (§3.2 del spec).
  Si una tarea te lleva a importar Konva ahí, la tarea está mal entendida.
- **Idioma:** código y nombres de símbolos en inglés; comentarios, docs y mensajes de
  commit en español.
- **Comentarios:** solo el POR QUÉ (restricciones externas, invariantes, decisiones no
  obvias). Nunca narrar lo que el código ya dice.
- **TDD sin excepciones:** test primero, verlo fallar, implementación mínima, verlo pasar,
  commit. Un paso que dice "ejecuta el test y compruébalo" significa leer la salida de
  verdad, no asumirla.

### Notas de traducción respecto al spec

Dos precisiones descubiertas al verificar las APIs reales. El spec las describe en
términos de intención; aquí está la implementación concreta:

| Spec dice | Implementación real |
|---|---|
| "debounce de 2 s y `maxDebounce` de 10 s" en `extension-database` | `DatabaseConfiguration` solo expone `fetch` y `store`. `debounce` y `maxDebounce` son opciones de **`ServerConfiguration`** de Hocuspocus |
| "ping/pong con corte a los 30 s" en `sync` | Es la opción **`timeout`** de `ServerConfiguration`, documentada como "defines in which interval the server sends a ping, and closes the connection when no pong is sent back". No hay que escribir el ping a mano |
| "círculo" como forma primitiva | `ShapeType` usa `'ellipse'`, con `w` y `h` como diámetros. El botón "círculo" de la toolbar crea una elipse con `w === h`. Un círculo con caja de selección rectangular es una elipse restringida; modelar ambos sería duplicar |

## File Structure

Ficheros que crea este plan, con su responsabilidad única:

```
.devcontainer/devcontainer.json     Adjuntar VS Code al servicio web
.devcontainer/Dockerfile            Imagen única de desarrollo (Node 24 + pnpm)
compose.yaml                        Los 5 servicios
.gitignore / .dockerignore          Exclusiones
package.json                        Raíz: scripts de orquestación
pnpm-workspace.yaml                 Declaración de workspaces
tsconfig.base.json                  Compilador compartido
.env.example                        Contrato de variables de entorno

packages/canvas-core/
  src/types.ts                      Tipos de forma. Sin lógica
  src/z-index.ts                    Índices fraccionarios y comparador con desempate
  src/doc.ts                        Acceso al Y.Doc y al Y.Map de formas
  src/operations.ts                 Mutaciones: add, update, move, delete, reorder
  src/selectors.ts                  Lectura: formas ordenadas, zIndex máximo
  src/presence.ts                   Tipos de awareness y GC puro de cursores
  src/index.ts                      Superficie pública del paquete

packages/schema/
  src/tables.ts                     Tablas Drizzle
  src/client.ts                     Pool de Postgres y cliente Drizzle
  drizzle.config.ts                 Config de drizzle-kit
  migrations/                       SQL generado

apps/api/src/index.ts               App Hono y arranque
apps/api/src/routes/health.ts       /health con verificación real de dependencias

apps/sync/src/index.ts              Servidor Hocuspocus y arranque
apps/sync/src/persistence.ts        Extensión Database sobre Drizzle

apps/web/src/main.tsx               Punto de entrada
apps/web/src/App.tsx                Layout y estado de conexión
apps/web/src/canvas/useCanvasDoc.ts Y.Doc + provider + suscripción
apps/web/src/canvas/CanvasStage.tsx Stage y las tres capas Konva
apps/web/src/canvas/ShapeNode.tsx   Render de una forma
apps/web/src/canvas/useDragCommit.ts Los tres carriles del arrastre
apps/web/src/canvas/CursorOverlay.tsx Cursores remotos e interpolación
apps/web/src/toolbar/Toolbar.tsx    Creación de formas
e2e/*.spec.ts                       Playwright
```

---

# FASE 0 — Andamio

**Criterio de fase:** `docker compose up` levanta los cinco servicios en estado healthy y
`pnpm -r test` pasa dentro del contenedor.

---

### Task 1: Monorepo, devcontainer e infraestructura

**Files:**
- Create: `.gitignore`, `.dockerignore`, `.env.example`
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`
- Create: `compose.yaml`

**Interfaces:**
- Consumes: nada. Es la primera tarea.
- Produces: el servicio `postgres` accesible en `postgres:5432` con
  `DATABASE_URL=postgres://canvas:canvas@postgres:5432/canvas`; el servicio `redis` en
  `redis://redis:6379`; comando `pnpm -r test`; workspaces `apps/*` y `packages/*`.

- [ ] **Step 1: Crear `.gitignore`**

```gitignore
node_modules/
dist/
.env
*.local
.vitest/
playwright-report/
test-results/
.worktrees/
```

- [ ] **Step 2: Crear `.dockerignore`**

```dockerignore
node_modules
dist
.git
docs
playwright-report
test-results
```

- [ ] **Step 3: Crear `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 4: Crear `package.json` de la raíz**

`packageManager` fija la versión de pnpm que corepack activará dentro del contenedor.

```json
{
  "name": "collab-canvas-crdt",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.15.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "7.0.2"
  }
}
```

- [ ] **Step 5: Crear `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 6: Crear `.env.example`**

```dotenv
DATABASE_URL=postgres://canvas:canvas@postgres:5432/canvas
REDIS_URL=redis://redis:6379
API_PORT=3001
SYNC_PORT=1234
WEB_PORT=5173
```

- [ ] **Step 7: Crear `.devcontainer/Dockerfile`**

Una sola imagen de desarrollo para las tres apps. Los Dockerfiles de producción por app
llegan en la fase 4, cuando exista el deploy; construirlos ahora sería trabajo que aún no
tiene consumidor.

```dockerfile
FROM node:24-bookworm-slim

# git lo necesita el devcontainer para su integración de control de versiones;
# ca-certificates, el registro de pnpm sobre HTTPS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /workspace
```

- [ ] **Step 8: Crear `compose.yaml`**

```yaml
name: collab-canvas

x-app: &app
  build:
    context: .
    dockerfile: .devcontainer/Dockerfile
  working_dir: /workspace
  volumes:
    - .:/workspace
  environment:
    DATABASE_URL: postgres://canvas:canvas@postgres:5432/canvas
    REDIS_URL: redis://redis:6379
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy

services:
  postgres:
    image: postgres:18.4-alpine
    environment:
      POSTGRES_USER: canvas
      POSTGRES_PASSWORD: canvas
      POSTGRES_DB: canvas
    volumes:
      # Postgres 18 movió PGDATA a /var/lib/postgresql/18/docker. Montar el volumen en la
      # ruta heredada /var/lib/postgresql/data hace que la imagen aborte con exit 1;
      # montar el directorio padre deja que Postgres use su layout versionado dentro del
      # volumen y mantiene viable un futuro `pg_upgrade --link`.
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U canvas -d canvas']
      interval: 5s
      timeout: 3s
      retries: 12

  redis:
    image: redis:8.8.1-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 12

  api:
    <<: *app
    command: pnpm --filter api dev
    ports:
      - '3001:3001'

  sync:
    <<: *app
    command: pnpm --filter sync dev
    ports:
      - '1234:1234'

  web:
    <<: *app
    command: pnpm --filter web dev
    ports:
      - '5173:5173'

volumes:
  pgdata:
```

- [ ] **Step 9: Crear `.devcontainer/devcontainer.json`**

Se adjunta al servicio `web` en lugar de añadir un sexto contenedor. `overrideCommand`
en `true` sustituye el `pnpm dev` por un proceso inactivo, para que tú arranques los
procesos desde la terminal y el HMR no compita con la consola del editor.

```json
{
  "name": "collab-canvas",
  "dockerComposeFile": ["../compose.yaml"],
  "service": "web",
  "workspaceFolder": "/workspace",
  "overrideCommand": true,
  "runServices": ["postgres", "redis"],
  "postCreateCommand": "pnpm install",
  "customizations": {
    "vscode": {
      "extensions": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
    }
  }
}
```

- [ ] **Step 10: Verificar que la infraestructura arranca healthy**

Run: `docker compose up -d postgres redis`
Then: `docker compose ps`
Expected: ambos servicios con estado `healthy`. Si `postgres` se queda en `starting` más
de un minuto, lee `docker compose logs postgres` antes de tocar nada.

- [ ] **Step 11: Verificar que pnpm funciona dentro del contenedor**

Run: `docker compose run --rm api pnpm --version`
Expected: imprime `10.15.0`. Confirma que corepack activó la versión fijada en
`packageManager`.

- [ ] **Step 12: Commit**

```bash
git add .gitignore .dockerignore .env.example package.json pnpm-workspace.yaml \
        tsconfig.base.json .devcontainer compose.yaml
git commit -m "feat: andamio del monorepo, devcontainer e infraestructura"
```

---

### Task 2: Paquete `schema` con Drizzle y migraciones

**Files:**
- Create: `packages/schema/package.json`, `packages/schema/tsconfig.json`
- Create: `packages/schema/src/tables.ts`, `packages/schema/src/client.ts`, `packages/schema/src/index.ts`
- Create: `packages/schema/drizzle.config.ts`
- Create: `packages/schema/vitest.config.ts`
- Create: `packages/schema/test/migrations.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` y el servicio `postgres` de la Task 1.
- Produces:
  - `boards`, `boardMembers`, `boardDocs` (tablas Drizzle)
  - `createDb(connectionString: string): { db: NodePgDatabase<typeof schema>, pool: Pool }`
  - `type Db = NodePgDatabase<typeof schema>`
  - Las columnas de `boardDocs` son: `boardId: text` (PK), `ydoc: customType<Uint8Array>`, `updatedAt: timestamp`

- [ ] **Step 1: Crear `packages/schema/package.json`**

```json
{
  "name": "@canvas/schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "drizzle-orm": "0.45.2",
    "pg": "8.22.0"
  },
  "devDependencies": {
    "@types/pg": "8.15.6",
    "drizzle-kit": "0.31.10",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: Crear `packages/schema/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Escribir el test que falla**

El test verifica que el esquema aplica contra un Postgres real y que las columnas
existen con el tipo esperado. Un test de esquema contra SQLite en memoria no valdría:
`bytea` es específico de Postgres y es justo la columna que importa.

`packages/schema/test/migrations.test.ts`:

```typescript
import { afterAll, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../src/index.js'
import type { Pool } from 'pg'

let db: Db
let pool: Pool

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida: ejecuta el test dentro del contenedor')
  ;({ db, pool } = createDb(url))
})

afterAll(async () => {
  await pool.end()
})

test('la tabla board_docs guarda el ydoc como bytea', async () => {
  const rows = await db.execute(sql`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'board_docs' AND column_name = 'ydoc'
  `)
  expect(rows.rows[0]).toEqual({ data_type: 'bytea' })
})

test('board_members restringe el rol a los tres valores del spec', async () => {
  const rows = await db.execute(sql`
    SELECT unnest(enum_range(NULL::board_role))::text AS role ORDER BY role
  `)
  expect(rows.rows.map((r) => r.role)).toEqual(['editor', 'owner', 'viewer'])
})

test('un ydoc escrito se recupera byte a byte', async () => {
  const bytes = new Uint8Array([1, 2, 3, 250, 251, 252])
  await db.execute(sql`INSERT INTO boards (id, title) VALUES ('t1', 'test')`)
  await db.execute(sql`INSERT INTO board_docs (board_id, ydoc) VALUES ('t1', ${Buffer.from(bytes)})`)

  const rows = await db.execute(sql`SELECT ydoc FROM board_docs WHERE board_id = 't1'`)
  expect(new Uint8Array(rows.rows[0]!.ydoc as Buffer)).toEqual(bytes)

  await db.execute(sql`DELETE FROM boards WHERE id = 't1'`)
})

test('el customType convierte en ambos sentidos a través del query builder', async () => {
  const bytes = new Uint8Array([0, 127, 128, 255, 42])
  await db.insert(boards).values({ id: 't2', title: 'roundtrip' })
  await db.insert(boardDocs).values({ boardId: 't2', ydoc: bytes })

  const [row] = await db.select().from(boardDocs).where(eq(boardDocs.boardId, 't2'))

  // El test de arriba usa SQL crudo y solo prueba que Postgres mueve un Buffer a una
  // columna bytea. Este pasa por el query builder, que es el único camino que ejercita
  // toDriver/fromDriver del customType — la conversión que consumen `api` y `sync`.
  expect(row!.ydoc).toBeInstanceOf(Uint8Array)
  expect(row!.ydoc).toEqual(bytes)

  await db.execute(sql`DELETE FROM boards WHERE id = 't2'`)
})
```

El segundo test necesita imports adicionales en la cabecera del fichero:

```typescript
import { eq, sql } from 'drizzle-orm'
import { boardDocs, boards, createDb, type Db } from '../src/index.js'
```

- [ ] **Step 4: Crear `packages/schema/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Los tests tocan un Postgres compartido: en paralelo se pisarían las filas.
    fileParallelism: false,
  },
})
```

- [ ] **Step 5: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm api pnpm --filter @canvas/schema test`
Expected: FAIL. No existe `src/index.ts`, así que falla al resolver el import.

- [ ] **Step 6: Escribir `packages/schema/src/tables.ts`**

```typescript
import { customType, index, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Estado binario de un Y.Doc. Drizzle no trae un tipo bytea nativo, y el driver de
 * Postgres entrega Buffer: la conversión a Uint8Array vive aquí para que ningún
 * consumidor tenga que saberlo.
 */
const ydocBytes = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
})

export const boardRole = pgEnum('board_role', ['owner', 'editor', 'viewer'])

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: boardRole('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] }), index('board_members_user_idx').on(t.userId)],
)

export const boardDocs = pgTable('board_docs', {
  boardId: text('board_id')
    .primaryKey()
    .references(() => boards.id, { onDelete: 'cascade' }),
  ydoc: ydocBytes('ydoc').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`ownerId` es nullable a propósito: la fase 1 crea boards sin usuarios, y la columna se
vuelve obligatoria en la fase 2 con Better Auth.

- [ ] **Step 7: Escribir `packages/schema/src/client.ts`**

```typescript
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './tables.js'

export type Db = NodePgDatabase<typeof schema>

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString })
  return { db: drizzle(pool, { schema }), pool }
}
```

- [ ] **Step 8: Escribir `packages/schema/src/index.ts`**

```typescript
export * from './tables.js'
export * from './client.js'
```

- [ ] **Step 9: Escribir `packages/schema/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/tables.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 10: Generar y aplicar la migración**

Run: `docker compose run --rm api pnpm install`
Run: `docker compose run --rm api pnpm --filter @canvas/schema db:generate`
Expected: aparece un `.sql` en `packages/schema/migrations/`. **Ábrelo y léelo**:
debe contener `CREATE TYPE "board_role"`, las tres tablas y `"ydoc" bytea NOT NULL`.
Run: `docker compose run --rm api pnpm --filter @canvas/schema db:migrate`
Expected: aplica sin error.

- [ ] **Step 11: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm api pnpm --filter @canvas/schema test`
Expected: PASS, 3 tests.

- [ ] **Step 12: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): tablas de boards, miembros y snapshots con Drizzle"
```

---

### Task 3: `api` con Hono y health real

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/health.ts`
- Create: `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: `createDb` de `@canvas/schema` (Task 2).
- Produces:
  - `createApp(deps: { db: Db; redis: RedisClientLike }): Hono` — la app sin servidor, para poder testearla sin abrir puertos
  - `interface RedisClientLike { ping(): Promise<string> }`
  - `GET /health` → `200 {"status":"ok","checks":{"db":true,"redis":true}}` o `503` si algo falla

- [ ] **Step 1: Crear `apps/api/package.json`**

```json
{
  "name": "api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@canvas/schema": "workspace:*",
    "@hono/node-server": "2.0.12",
    "hono": "4.12.32",
    "redis": "6.1.0"
  },
  "devDependencies": {
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

**Por qué `tsx` y no `node --watch` con type stripping**, que fue el primer intento y no
funciona en este monorepo (verificado empíricamente con Node 24.18.1):

1. Node **no** resuelve un import `./foo.js` hacia `foo.ts` — devuelve `ERR_MODULE_NOT_FOUND`.
   Todo el código del repo usa la extensión `.js` en los imports, que es la convención de
   `module: nodenext` y solo se resuelve al compilar.
2. Node **se niega** a hacer type stripping dentro de `node_modules`
   (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), y los paquetes de un workspace pnpm son
   symlinks ahí. Con `"main": "./src/index.ts"`, `@canvas/schema` sería inconsumible.

`tsx` resuelve los dos casos. Ojo al modo de fallo: los **tests siguen pasando** sin `tsx`
porque Vitest usa el resolver de Vite, que sí hace ambas cosas — el fallo aparece solo al
arrancar el servicio, como healthcheck en rojo.

- [ ] **Step 2: Crear `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "types": ["node"] },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Crear `apps/api/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 4: Escribir el test que falla**

El health check tiene que **verificar** las dependencias, no devolver `ok` incondicional.
Un health que siempre dice que sí no informa de nada, y el `depends_on` del compose
acabaría confiando en él.

`apps/api/test/health.test.ts`:

```typescript
import { expect, test } from 'vitest'
import { createApp } from '../src/app.js'
import type { Db } from '@canvas/schema'

const okDb = { execute: async () => ({ rows: [{ '?column?': 1 }] }) } as unknown as Db
const failDb = {
  execute: async () => {
    throw new Error('conexión rechazada')
  },
} as unknown as Db

test('devuelve 200 y ok cuando db y redis responden', async () => {
  const app = createApp({ db: okDb, redis: { ping: async () => 'PONG' } })
  const res = await app.request('/health')

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok', checks: { db: true, redis: true } })
})

test('devuelve 503 y marca el fallo cuando la db no responde', async () => {
  const app = createApp({ db: failDb, redis: { ping: async () => 'PONG' } })
  const res = await app.request('/health')

  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ status: 'degraded', checks: { db: false, redis: true } })
})

test('devuelve 503 cuando redis no responde', async () => {
  const app = createApp({
    db: okDb,
    redis: {
      ping: async () => {
        throw new Error('timeout')
      },
    },
  })
  const res = await app.request('/health')

  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ status: 'degraded', checks: { db: true, redis: false } })
})
```

- [ ] **Step 5: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm api pnpm --filter api test`
Expected: FAIL, no resuelve `../src/app.js`.

- [ ] **Step 6: Escribir `apps/api/src/routes/health.ts`**

```typescript
import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import type { Db } from '@canvas/schema'

export interface RedisClientLike {
  ping(): Promise<string>
}

export interface HealthDeps {
  db: Db
  redis: RedisClientLike
}

async function succeeds(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe()
    return true
  } catch {
    return false
  }
}

export function healthRoute(deps: HealthDeps): Hono {
  const route = new Hono()

  route.get('/health', async (c) => {
    const [db, redis] = await Promise.all([
      succeeds(() => deps.db.execute(sql`SELECT 1`)),
      succeeds(() => deps.redis.ping()),
    ])

    const healthy = db && redis
    return c.json(
      { status: healthy ? 'ok' : 'degraded', checks: { db, redis } },
      healthy ? 200 : 503,
    )
  })

  return route
}
```

- [ ] **Step 7: Escribir `apps/api/src/app.ts`**

```typescript
import { Hono } from 'hono'
import { healthRoute, type HealthDeps } from './routes/health.js'

export function createApp(deps: HealthDeps): Hono {
  const app = new Hono()
  app.route('/', healthRoute(deps))
  return app
}
```

- [ ] **Step 8: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm api pnpm --filter api test`
Expected: PASS, 3 tests.

- [ ] **Step 9: Escribir `apps/api/src/index.ts`**

```typescript
import { serve } from '@hono/node-server'
import { createClient } from 'redis'
import { createDb } from '@canvas/schema'
import { createApp } from './app.js'

const port = Number(process.env.API_PORT ?? 3001)

const { db } = createDb(process.env.DATABASE_URL!)
const redis = createClient({ url: process.env.REDIS_URL! })
await redis.connect()

serve({ fetch: createApp({ db, redis }).fetch, port })
console.log(`api escuchando en :${port}`)
```

- [ ] **Step 10: Añadir el healthcheck del servicio `api` al compose**

Modify: `compose.yaml`, dentro del servicio `api`, después de `ports`:

```yaml
    healthcheck:
      test: ['CMD-SHELL', 'node -e "fetch(\"http://localhost:3001/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"']
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 20s
```

- [ ] **Step 11: Verificar el servicio en marcha de verdad**

Run: `docker compose up -d api`
Run: `docker compose ps api`
Expected: `healthy`.
Run: `curl -s localhost:3001/health`
Expected: `{"status":"ok","checks":{"db":true,"redis":true}}`

- [ ] **Step 12: Commit**

```bash
git add apps/api compose.yaml
git commit -m "feat(api): app Hono con health que verifica Postgres y Redis"
```

---

### Task 4: `sync` con Hocuspocus y persistencia en Postgres

**Files:**
- Create: `apps/sync/package.json`, `apps/sync/tsconfig.json`, `apps/sync/vitest.config.ts`
- Create: `apps/sync/src/persistence.ts`, `apps/sync/src/server.ts`, `apps/sync/src/index.ts`
- Create: `apps/sync/test/persistence.test.ts`

**Interfaces:**
- Consumes: `createDb`, `boardDocs`, `boards` de `@canvas/schema` (Task 2).
- Produces:
  - `createPersistence(db: Db): Database` — la extensión de Hocuspocus
  - `createSyncServer(opts: { port: number; db: Db; redisUrl?: string }): Server`
  - Servicio `sync` escuchando WebSocket en `ws://sync:1234`
  - `SYNC_TIMEOUT_MS = 30_000`, `STORE_DEBOUNCE_MS = 2_000`, `STORE_MAX_DEBOUNCE_MS = 10_000`

- [ ] **Step 1: Crear `apps/sync/package.json`**

```json
{
  "name": "sync",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@canvas/schema": "workspace:*",
    "@hocuspocus/extension-database": "4.4.0",
    "@hocuspocus/extension-redis": "4.4.0",
    "@hocuspocus/server": "4.4.0",
    "yjs": "13.6.31"
  },
  "devDependencies": {
    "@hocuspocus/provider": "4.4.0",
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10",
    "ws": "8.20.0"
  }
}
```

- [ ] **Step 2: Crear `apps/sync/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "types": ["node"] },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Crear `apps/sync/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Cada test abre un servidor y toca la misma tabla: en paralelo se estorban.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
```

- [ ] **Step 4: Escribir el test que falla**

Test de integración con servidor y cliente reales. El caso que importa es el ciclo
completo: escribir, dejar que persista, tirar el servidor, arrancarlo de nuevo y
comprobar que el estado sobrevivió.

`apps/sync/test/persistence.test.ts`:

```typescript
import { afterAll, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { WebSocket } from 'ws'
import { createDb, type Db } from '@canvas/schema'
import { createSyncServer } from '../src/server.js'
import { createPersistence } from '../src/persistence.js'
import type { Pool } from 'pg'

const BOARD = 'board-persistencia'
let db: Db
let pool: Pool

beforeAll(async () => {
  ;({ db, pool } = createDb(process.env.DATABASE_URL!))
  await db.execute(sql`INSERT INTO boards (id, title) VALUES (${BOARD}, 'test')
                       ON CONFLICT (id) DO NOTHING`)
})

afterAll(async () => {
  await db.execute(sql`DELETE FROM boards WHERE id = ${BOARD}`)
  await pool.end()
})

async function connect(port: number, doc: Y.Doc): Promise<HocuspocusProvider> {
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${port}`,
    name: BOARD,
    document: doc,
    // El entorno de Node no trae WebSocket global compatible con el provider.
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  })
  await new Promise<void>((resolve) => {
    if (provider.isSynced) return resolve()
    provider.on('synced', () => resolve())
  })
  return provider
}

test('el estado del documento sobrevive a un reinicio del servidor', async () => {
  const first = createSyncServer({ port: 4101, db })
  await first.listen()

  const docA = new Y.Doc()
  const providerA = await connect(4101, docA)
  docA.getMap('shapes').set('s1', 'rectangulo')

  // Fuerza el flush de los onStoreDocument pendientes antes de tirar el servidor,
  // en lugar de esperar el debounce de 2 s.
  await first.hocuspocus.storeDocumentHooks()
  providerA.destroy()
  await first.destroy()

  const second = createSyncServer({ port: 4102, db })
  await second.listen()

  const docB = new Y.Doc()
  const providerB = await connect(4102, docB)
  expect(docB.getMap('shapes').get('s1')).toBe('rectangulo')

  providerB.destroy()
  await second.destroy()
})

test('el snapshot queda escrito en board_docs', async () => {
  const rows = await db.execute(sql`SELECT ydoc FROM board_docs WHERE board_id = ${BOARD}`)
  expect(rows.rows).toHaveLength(1)
  expect((rows.rows[0]!.ydoc as Buffer).byteLength).toBeGreaterThan(0)
})

test('un snapshot ilegible lanza en lugar de servir un documento vacío', async () => {
  const CORRUPT = 'board-corrupto'
  await db.execute(sql`INSERT INTO boards (id, title) VALUES (${CORRUPT}, 'corrupto')
                       ON CONFLICT (id) DO NOTHING`)
  await db.execute(sql`
    INSERT INTO board_docs (board_id, ydoc) VALUES (${CORRUPT}, ${Buffer.from([255, 255, 255, 255])})
    ON CONFLICT (board_id) DO UPDATE SET ydoc = EXCLUDED.ydoc
  `)

  const persistence = createPersistence(db)

  // Si esto devolviera null en vez de lanzar, Hocuspocus trataría el board como nuevo:
  // el usuario lo abriría vacío y su primera edición sobrescribiría el board real.
  await expect(
    persistence.configuration.fetch({ documentName: CORRUPT } as never),
  ).rejects.toThrow(/ilegible/)

  await db.execute(sql`DELETE FROM boards WHERE id = ${CORRUPT}`)
})
```

> **Nota para el ejecutor:** `storeDocumentHooks()` es el nombre que aparece en los
> tipos de `Hocuspocus` como "immediately execute all pending debounced onStoreDocument
> calls". Si al ejecutar el test el método no existe con ese nombre exacto, localízalo
> con `grep -n "pending debounced" -A 4 node_modules/@hocuspocus/server/dist/index.d.ts`
> y usa el que declare el tipo. **No sustituyas la llamada por un `sleep`**: haría el
> test lento y no deterministamente correcto.

- [ ] **Step 5: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm sync pnpm --filter sync test`
Expected: FAIL, no resuelve `../src/server.js`.

- [ ] **Step 6: Escribir `apps/sync/src/persistence.ts`**

```typescript
import { Database } from '@hocuspocus/extension-database'
import { eq, sql } from 'drizzle-orm'
import * as Y from 'yjs'
import { boardDocs, type Db } from '@canvas/schema'

/**
 * Un snapshot ilegible no puede devolverse como si no existiera: Hocuspocus trataría el
 * board como nuevo, el usuario lo abriría vacío y su primera edición sobrescribiría el
 * board real (§7 del spec). Se valida aplicándolo sobre un doc desechable, que es la
 * única comprobación que garantiza que Yjs podrá cargarlo.
 */
function assertLoadable(documentName: string, bytes: Uint8Array): Uint8Array {
  try {
    Y.applyUpdate(new Y.Doc(), bytes)
    return bytes
  } catch (cause) {
    throw new Error(`snapshot ilegible para el board "${documentName}"`, { cause })
  }
}

export function createPersistence(db: Db): Database {
  return new Database({
    // null significa "board sin snapshot todavía", que sí es un documento nuevo legítimo.
    fetch: async ({ documentName }) => {
      const rows = await db
        .select({ ydoc: boardDocs.ydoc })
        .from(boardDocs)
        .where(eq(boardDocs.boardId, documentName))
        .limit(1)

      const stored = rows[0]?.ydoc
      return stored ? assertLoadable(documentName, stored) : null
    },

    store: async ({ documentName, state }) => {
      await db
        .insert(boardDocs)
        .values({ boardId: documentName, ydoc: new Uint8Array(state) })
        .onConflictDoUpdate({
          target: boardDocs.boardId,
          set: { ydoc: new Uint8Array(state), updatedAt: sql`now()` },
        })
    },
  })
}
```

- [ ] **Step 7: Escribir `apps/sync/src/server.ts`**

```typescript
import { Server } from '@hocuspocus/server'
import { Redis } from '@hocuspocus/extension-redis'
import type { Extension } from '@hocuspocus/server'
import type { Db } from '@canvas/schema'
import { createPersistence } from './persistence.js'

/**
 * Intervalo de ping del servidor: si no llega el pong, corta la conexión. Es el
 * mecanismo que purga los cursores fantasma de §5.4 del spec — el awareness de una
 * conexión terminada se limpia y se propaga solo.
 */
export const SYNC_TIMEOUT_MS = 30_000

export const STORE_DEBOUNCE_MS = 2_000
export const STORE_MAX_DEBOUNCE_MS = 10_000

export interface SyncServerOptions {
  port: number
  db: Db
  redisUrl?: string
}

export function createSyncServer({ port, db, redisUrl }: SyncServerOptions): Server {
  const extensions: Extension[] = [createPersistence(db)]

  // Redis solo aporta con más de una réplica. En los tests se omite para no
  // acoplarlos a un servicio que no están verificando.
  if (redisUrl) extensions.push(new Redis({ redis: { url: redisUrl } }))

  return new Server({
    port,
    timeout: SYNC_TIMEOUT_MS,
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: STORE_MAX_DEBOUNCE_MS,
    quiet: true,
    extensions,
  })
}
```

- [ ] **Step 8: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm sync pnpm --filter sync test`
Expected: PASS, 3 tests. Si falla la construcción de `Redis`, comprueba que no le estás
pasando `redisUrl` desde el test.

- [ ] **Step 9: Escribir `apps/sync/src/index.ts`**

```typescript
import { createDb } from '@canvas/schema'
import { createSyncServer } from './server.js'

const port = Number(process.env.SYNC_PORT ?? 1234)
const { db } = createDb(process.env.DATABASE_URL!)

const server = createSyncServer({ port, db, redisUrl: process.env.REDIS_URL })
await server.listen()
console.log(`sync escuchando en ws://0.0.0.0:${port}`)
```

- [ ] **Step 10: Verificar el servicio en marcha**

Run: `docker compose up -d sync`
Run: `docker compose logs sync`
Expected: la línea `sync escuchando en ws://0.0.0.0:1234` y ningún stack trace.

- [ ] **Step 11: Commit**

```bash
git add apps/sync
git commit -m "feat(sync): servidor Hocuspocus con persistencia en Postgres y timeout de 30s"
```

---

### Task 5: `web` con Vite 8 y React 19 — cierre de la fase 0

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`
- Create: `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Create: `docs/guias/entorno-de-desarrollo.md`
- Modify: `docs/README.md` (añadir la guía al índice)

**Interfaces:**
- Consumes: los servicios `api` y `sync` de las Tasks 3 y 4.
- Produces:
  - App React servida en `http://localhost:5173`
  - `VITE_SYNC_URL` y `VITE_API_URL` como variables de entorno del cliente
  - La fase 0 cerrada y verificable

- [ ] **Step 1: Crear `apps/web/package.json`**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "5.1.0",
    "typescript": "7.0.2",
    "vite": "8.2.0",
    "vitest": "4.1.10"
  }
}
```

`--host 0.0.0.0` no es opcional: sin él, Vite escucha solo en la loopback del contenedor
y el navegador del host no llega.

- [ ] **Step 2: Crear `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["es2023", "dom", "dom.iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `apps/web/vite.config.ts`**

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El bind mount desde macOS no propaga eventos inotify de forma fiable;
    // sin polling el HMR se pierde cambios.
    watch: { usePolling: true },
  },
})
```

- [ ] **Step 4: Crear `apps/web/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lienzo colaborativo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Crear `apps/web/src/App.tsx`**

```tsx
export function App() {
  return (
    <main>
      <h1>Lienzo colaborativo</h1>
      <p>Fase 0: andamio en marcha.</p>
    </main>
  )
}
```

- [ ] **Step 6: Crear `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Añadir las variables del cliente al compose**

Modify: `compose.yaml`, en el servicio `web`, añade un bloque `environment` propio.
Las variables `VITE_*` son las únicas que Vite expone al navegador, y apuntan al host
porque las resuelve el navegador, no el contenedor.

```yaml
    environment:
      DATABASE_URL: postgres://canvas:canvas@postgres:5432/canvas
      REDIS_URL: redis://redis:6379
      VITE_API_URL: http://localhost:3001
      VITE_SYNC_URL: ws://localhost:1234
```

- [ ] **Step 8: Verificar los cinco servicios juntos**

Run: `docker compose up -d`
Run: `docker compose ps`
Expected: `postgres` healthy, `redis` healthy, `api` healthy, `sync` y `web` en `running`.
Run: `curl -s -o /dev/null -w '%{http_code}' localhost:5173`
Expected: `200`.

- [ ] **Step 9: Verificar la suite completa dentro del contenedor**

Run: `docker compose run --rm api pnpm -r test`
Expected: PASS en `@canvas/schema` (3) y `api` (3); `sync` (2) también si `DATABASE_URL`
está presente. `web` pasa sin tests todavía.

- [ ] **Step 10: Escribir `docs/guias/entorno-de-desarrollo.md`**

```markdown
# Guía: entorno de desarrollo

Todo corre en contenedores sobre OrbStack. **Nunca ejecutes `pnpm` en el host**: no hay
Node instalado y `node_modules` contiene binarios compilados para Linux.

## Arrancar

    docker compose up -d
    docker compose ps      # los cinco servicios

- Web: http://localhost:5173
- API: http://localhost:3001/health
- Sync: ws://localhost:1234

## Trabajar dentro del contenedor

Abre el proyecto con VS Code y «Reopen in Container». El devcontainer se adjunta al
servicio `web` y levanta `postgres` y `redis`. Los procesos de las apps los arrancas tú:

    pnpm dev                      # las tres apps en paralelo
    pnpm --filter web dev         # solo una

## Comandos habituales

    pnpm -r test                              # toda la suite
    pnpm --filter @canvas/canvas-core test    # un paquete
    pnpm --filter @canvas/schema db:generate  # migración tras cambiar tablas
    pnpm --filter @canvas/schema db:migrate   # aplicarla

## Base de datos

    docker compose exec postgres psql -U canvas -d canvas
```

- [ ] **Step 11: Añadir la guía al índice de documentación**

Modify: `docs/README.md`. En la sección «Documentación viva», sustituye la línea
`- \`guias/\` — cómo hacer X: ...` por la entrada real:

```markdown
- [Guía: entorno de desarrollo](guias/entorno-de-desarrollo.md) — arrancar los cinco servicios, trabajar dentro del devcontainer y comandos habituales.
```

- [ ] **Step 12: Commit**

```bash
git add apps/web compose.yaml docs/guias docs/README.md
git commit -m "feat(web): shell React con Vite 8 y cierre de la fase 0"
```

---

# FASE 1 — MVP

**Criterio de fase:** dos navegadores editan sin conflicto, los cursores se mueven con
suavidad y el test de partición de red pasa.

**Nota sobre el texto colaborativo:** el modelo guarda el contenido de una forma de texto
como `Y.Text` en la clave `content`, fiel al spec. La fase 1 lo **muestra** pero no
permite editarlo in-place; la edición carácter a carácter llega con la fase 3. `readShapes`
expone `text: string` derivado, para que el renderer no tenga que conocer `Y.Text`.

---

### Task 6: `canvas-core` — tipos e índices fraccionarios

**Files:**
- Create: `packages/canvas-core/package.json`, `packages/canvas-core/tsconfig.json`, `packages/canvas-core/vitest.config.ts`
- Create: `packages/canvas-core/src/types.ts`, `packages/canvas-core/src/z-index.ts`
- Create: `packages/canvas-core/test/z-index.test.ts`

**Interfaces:**
- Consumes: nada. Es la base del paquete.
- Produces:
  - `type ShapeId = string`
  - `type ShapeType = 'rect' | 'ellipse' | 'text' | 'arrow'`
  - `interface ShapeProps { type; x; y; w; h; rotation; fill; stroke; zIndex; text }` — `zIndex` es `string`, `text` es `string`
  - `interface Shape extends ShapeProps { id: ShapeId }`
  - `keyBetween(a: string | null, b: string | null): string`
  - `keyAfter(highest: string | null): string`
  - `compareZ(a: ZOrdered, b: ZOrdered): number` con `type ZOrdered = Pick<Shape, 'id' | 'zIndex'>`

- [ ] **Step 1: Crear `packages/canvas-core/package.json`**

```json
{
  "name": "@canvas/canvas-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fractional-indexing": "4.0.0",
    "yjs": "13.6.31"
  },
  "devDependencies": {
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

`react`, `react-dom` y `konva` **no** aparecen aquí, ni aparecerán. Es la restricción de
§3.2 del spec expresada donde se puede verificar: en el manifiesto del paquete.

- [ ] **Step 2: Crear `packages/canvas-core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Crear `packages/canvas-core/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 4: Escribir el test que falla**

El caso crítico no es que las claves ordenen: es el **empate**. Dos clientes que insertan
en el mismo hueco generan la misma clave, y sin el desempate por `id` cada navegador
ordenaría distinto sobre un estado convergente (§4.1 del spec).

`packages/canvas-core/test/z-index.test.ts`:

```typescript
import { expect, test } from 'vitest'
import { compareZ, keyAfter, keyBetween } from '../src/z-index.js'
import type { ShapeId } from '../src/types.js'

const s = (id: ShapeId, zIndex: string) => ({ id, zIndex })

test('la primera clave de un board vacío es estable', () => {
  expect(keyBetween(null, null)).toBe('a0')
})

test('keyAfter produce una clave mayor que la anterior', () => {
  const first = keyAfter(null)
  const second = keyAfter(first)
  expect(second > first).toBe(true)
})

test('keyBetween cae estrictamente entre sus vecinos', () => {
  const mid = keyBetween('a0', 'a1')
  expect(mid > 'a0').toBe(true)
  expect(mid < 'a1').toBe(true)
})

test('ordena por zIndex cuando las claves difieren', () => {
  const shapes = [s('x', 'a2'), s('y', 'a0'), s('z', 'a1')]
  expect([...shapes].sort(compareZ).map((v) => v.id)).toEqual(['y', 'z', 'x'])
})

test('con zIndex idéntico desempata por id de forma determinista', () => {
  const shapes = [s('bbb', 'a0'), s('aaa', 'a0')]
  expect([...shapes].sort(compareZ).map((v) => v.id)).toEqual(['aaa', 'bbb'])
})

test('el orden resultante no depende del orden de entrada', () => {
  const a = s('aaa', 'a0')
  const b = s('bbb', 'a0')
  const c = s('ccc', 'a0')

  const forward = [a, b, c].sort(compareZ).map((v) => v.id)
  const backward = [c, b, a].sort(compareZ).map((v) => v.id)

  expect(forward).toEqual(backward)
})
```

- [ ] **Step 5: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test`
Expected: FAIL, no resuelve `../src/z-index.js`.

- [ ] **Step 6: Escribir `packages/canvas-core/src/types.ts`**

```typescript
export type ShapeId = string

/**
 * El "círculo" del spec se modela como elipse con `w === h`: una caja de selección
 * rectangular ya describe un círculo, y tener ambos tipos duplicaría el render y el
 * hit-testing sin añadir nada.
 */
export type ShapeType = 'rect' | 'ellipse' | 'text' | 'arrow'

export interface ShapeProps {
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  /** Grados, no radianes: es lo que espera Konva. */
  rotation: number
  fill: string
  stroke: string
  /** Índice fraccionario. Se compara como string, nunca como número. */
  zIndex: string
  /** Vacío salvo en formas de tipo `text`. Derivado del Y.Text del documento. */
  text: string
}

export interface Shape extends ShapeProps {
  id: ShapeId
}

export type ZOrdered = Pick<Shape, 'id' | 'zIndex'>
```

- [ ] **Step 7: Escribir `packages/canvas-core/src/z-index.ts`**

```typescript
import { generateKeyBetween } from 'fractional-indexing'
import type { ZOrdered } from './types.js'

/**
 * `a` y `b` son las claves de los vecinos de destino, o null en los extremos.
 * `generateKeyBetween(null, null)` devuelve 'a0' con el alfabeto por defecto (A-Z/a-z).
 */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

export function keyAfter(highest: string | null): string {
  return generateKeyBetween(highest, null)
}

/**
 * Comparador de pintado. El desempate por `id` es obligatorio: dos clientes que insertan
 * en el mismo hueco pueden generar la misma clave, y sin segundo criterio el orden
 * quedaría indefinido — estado convergente, pantallas divergentes.
 */
export function compareZ(a: ZOrdered, b: ZOrdered): number {
  if (a.zIndex !== b.zIndex) return a.zIndex < b.zIndex ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
```

- [ ] **Step 8: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/canvas-core
git commit -m "feat(canvas-core): tipos de forma e índices fraccionarios con desempate"
```

---

### Task 7: `canvas-core` — documento y operaciones con convergencia

**Files:**
- Create: `packages/canvas-core/src/doc.ts`, `packages/canvas-core/src/operations.ts`, `packages/canvas-core/src/selectors.ts`, `packages/canvas-core/src/index.ts`
- Create: `packages/canvas-core/test/convergence.test.ts`

**Interfaces:**
- Consumes: `ShapeId`, `ShapeType`, `ShapeProps`, `Shape`, `compareZ`, `keyAfter`, `keyBetween` (Task 6).
- Produces:
  - `SHAPES_KEY = 'shapes'`
  - `shapesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>>`
  - `interface NewShape { type: ShapeType; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; text?: string }`
  - `addShape(doc: Y.Doc, shape: NewShape, id?: ShapeId): ShapeId`
  - `type ShapePatch = Partial<Pick<ShapeProps, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'fill' | 'stroke' | 'zIndex'>>`
  - `updateShape(doc: Y.Doc, id: ShapeId, patch: ShapePatch): void`
  - `deleteShapes(doc: Y.Doc, ids: readonly ShapeId[]): void`
  - `readShapes(doc: Y.Doc): Shape[]` — **ya ordenadas** por `compareZ`
  - `readShape(doc: Y.Doc, id: ShapeId): Shape | null`

`selectors.ts` vive en esta tarea, no en la siguiente: los tests de convergencia de aquí
leen el documento con `readShapes` y `readShape`, así que sin ellos la tarea no podría
cerrar en verde.

- [ ] **Step 1: Escribir el test que falla**

Este es el test que sostiene la promesa entera del diseño: dos usuarios cambian
**propiedades distintas de la misma forma** y ambos cambios sobreviven. Si el modelo usara
objetos JSON planos, uno de los dos se perdería (§4.1 del spec).

`packages/canvas-core/test/convergence.test.ts`:

```typescript
import { expect, test } from 'vitest'
import * as Y from 'yjs'
import { addShape, deleteShapes, updateShape } from '../src/operations.js'
import { readShape, readShapes } from '../src/selectors.js'

/** Sincroniza dos docs en ambos sentidos, como haría el servidor. */
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

function pair(): [Y.Doc, Y.Doc] {
  return [new Y.Doc(), new Y.Doc()]
}

test('cambios concurrentes en propiedades distintas de la misma forma sobreviven ambos', () => {
  const [a, b] = pair()
  const id = addShape(a, { type: 'rect', x: 0, y: 0, w: 100, h: 50 }, 'shape-1')
  sync(a, b)

  // Sin red entre ellos: A mueve, B recolorea.
  updateShape(a, id, { x: 300 })
  updateShape(b, id, { fill: '#ff0000' })
  sync(a, b)

  for (const doc of [a, b]) {
    const shape = readShape(doc, id)
    expect(shape?.x).toBe(300)
    expect(shape?.fill).toBe('#ff0000')
  }
})

test('dos formas creadas a la vez conviven y ordenan igual en ambos clientes', () => {
  const [a, b] = pair()
  addShape(a, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'from-a')
  addShape(b, { type: 'ellipse', x: 5, y: 5, w: 10, h: 10 }, 'from-b')
  sync(a, b)

  const idsA = readShapes(a).map((s) => s.id)
  const idsB = readShapes(b).map((s) => s.id)

  expect(idsA).toHaveLength(2)
  expect(idsA).toEqual(idsB)
})

test('borrar en un cliente gana sobre editar en el otro', () => {
  const [a, b] = pair()
  const id = addShape(a, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'shape-1')
  sync(a, b)

  deleteShapes(a, [id])
  updateShape(b, id, { x: 999 })
  sync(a, b)

  // El Y.Map de la forma se elimina del mapa raíz: el update de B se aplica sobre un
  // sub-mapa huérfano y no resucita la forma. Verificar esto es importante porque la
  // alternativa (la forma reaparece con datos parciales) sería un bug silencioso.
  expect(readShape(a, id)).toBeNull()
  expect(readShape(b, id)).toBeNull()
})

test('una forma de texto conserva su contenido al sincronizar', () => {
  const [a, b] = pair()
  const id = addShape(a, { type: 'text', x: 0, y: 0, w: 200, h: 40, text: 'hola' }, 'text-1')
  sync(a, b)

  expect(readShape(b, id)?.text).toBe('hola')
})

test('addShape asigna zIndex creciente a cada forma nueva', () => {
  const doc = new Y.Doc()
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'first')
  addShape(doc, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'second')

  const [first, second] = readShapes(doc)
  expect(second!.zIndex > first!.zIndex).toBe(true)
})
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test convergence`
Expected: FAIL, no resuelve `../src/operations.js`.

- [ ] **Step 3: Escribir `packages/canvas-core/src/doc.ts`**

```typescript
import * as Y from 'yjs'

export const SHAPES_KEY = 'shapes'

/**
 * Cada forma es un Y.Map anidado, no un objeto plano: así el merge es por propiedad y
 * dos usuarios editando campos distintos de la misma forma no se sobrescriben.
 */
export function shapesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(SHAPES_KEY)
}
```

- [ ] **Step 4: Escribir `packages/canvas-core/src/operations.ts`**

```typescript
import * as Y from 'yjs'
import { shapesMap } from './doc.js'
import type { ShapeId, ShapeProps, ShapeType } from './types.js'
import { compareZ, keyAfter } from './z-index.js'

export interface NewShape {
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  text?: string
}

export type ShapePatch = Partial<
  Pick<ShapeProps, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'fill' | 'stroke' | 'zIndex'>
>

const DEFAULT_FILL = '#d8dee9'
const DEFAULT_STROKE = '#2e3440'

function highestZIndex(doc: Y.Doc): string | null {
  let highest: string | null = null
  for (const shape of shapesMap(doc).values()) {
    const zIndex = shape.get('zIndex')
    if (typeof zIndex !== 'string') continue
    if (highest === null || compareZ({ id: '', zIndex }, { id: '', zIndex: highest }) > 0) {
      highest = zIndex
    }
  }
  return highest
}

export function addShape(doc: Y.Doc, shape: NewShape, id: ShapeId = crypto.randomUUID()): ShapeId {
  const zIndex = keyAfter(highestZIndex(doc))

  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('type', shape.type)
    entry.set('x', shape.x)
    entry.set('y', shape.y)
    entry.set('w', shape.w)
    entry.set('h', shape.h)
    entry.set('rotation', 0)
    entry.set('fill', shape.fill ?? DEFAULT_FILL)
    entry.set('stroke', shape.stroke ?? DEFAULT_STROKE)
    entry.set('zIndex', zIndex)

    // El contenido de texto es Y.Text incluso cuando la fase 1 no lo edita: cambiar el
    // tipo más adelante obligaría a migrar documentos ya persistidos.
    if (shape.type === 'text') {
      const content = new Y.Text()
      if (shape.text) content.insert(0, shape.text)
      entry.set('content', content)
    }

    shapesMap(doc).set(id, entry)
  })

  return id
}

export function updateShape(doc: Y.Doc, id: ShapeId, patch: ShapePatch): void {
  const entry = shapesMap(doc).get(id)
  if (!entry) return

  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value)
    }
  })
}

export function deleteShapes(doc: Y.Doc, ids: readonly ShapeId[]): void {
  doc.transact(() => {
    const shapes = shapesMap(doc)
    for (const id of ids) shapes.delete(id)
  })
}
```

- [ ] **Step 5: Escribir `packages/canvas-core/src/selectors.ts`**

```typescript
import type * as Y from 'yjs'
import { shapesMap } from './doc.js'
import type { Shape, ShapeId, ShapeType } from './types.js'
import { compareZ } from './z-index.js'

function toShape(id: ShapeId, entry: Y.Map<unknown>): Shape | null {
  const type = entry.get('type') as ShapeType | undefined
  const zIndex = entry.get('zIndex')
  // Una entrada sin type o sin zIndex es un documento a medio escribir por una versión
  // anterior del cliente; se ignora en lugar de romper el render entero.
  if (!type || typeof zIndex !== 'string') return null

  const content = entry.get('content') as { toString(): string } | undefined

  return {
    id,
    type,
    zIndex,
    x: Number(entry.get('x') ?? 0),
    y: Number(entry.get('y') ?? 0),
    w: Number(entry.get('w') ?? 0),
    h: Number(entry.get('h') ?? 0),
    rotation: Number(entry.get('rotation') ?? 0),
    fill: String(entry.get('fill') ?? '#d8dee9'),
    stroke: String(entry.get('stroke') ?? '#2e3440'),
    text: content ? content.toString() : '',
  }
}

/** Devuelve las formas ya ordenadas para pintar. El consumidor no debe reordenar. */
export function readShapes(doc: Y.Doc): Shape[] {
  const shapes: Shape[] = []
  for (const [id, entry] of shapesMap(doc).entries()) {
    const shape = toShape(id, entry)
    if (shape) shapes.push(shape)
  }
  return shapes.sort(compareZ)
}

export function readShape(doc: Y.Doc, id: ShapeId): Shape | null {
  const entry = shapesMap(doc).get(id)
  return entry ? toShape(id, entry) : null
}
```

- [ ] **Step 6: Escribir `packages/canvas-core/src/index.ts`**

Exporta solo lo que ya existe. `presence.js` se añade a este fichero en la Task 8, cuando
el módulo exista: un index que apunte a un fichero ausente rompe el typecheck del paquete.

```typescript
export * from './types.js'
export * from './z-index.js'
export * from './doc.js'
export * from './operations.js'
export * from './selectors.js'
```

- [ ] **Step 7: Ejecutar los tests y verlos pasar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test`
Expected: PASS, 11 tests (6 de z-index de la Task 6, 5 de convergencia de esta).
Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add packages/canvas-core
git commit -m "feat(canvas-core): documento Yjs, operaciones y lectura ordenada"
```

---

### Task 8: `canvas-core` — presencia y GC de cursores

**Files:**
- Create: `packages/canvas-core/src/presence.ts`
- Create: `packages/canvas-core/test/presence.test.ts`
- Modify: `packages/canvas-core/src/index.ts` (añadir el export de `presence`)

**Interfaces:**
- Consumes: `ShapeId` (Task 6). No toca el documento: es lógica de presencia pura.
- Produces:
  - `CURSOR_TTL_MS = 30_000`
  - `interface Presence { name: string; color: string; cursor: { x: number; y: number } | null; selection: ShapeId[]; dragging: Record<ShapeId, { x: number; y: number }> | null }`
  - `staleClientIds(lastSeen: ReadonlyMap<number, number>, now: number, ttlMs?: number): number[]`

- [ ] **Step 1: Escribir el test que falla**

`staleClientIds` es una función pura, así que el GC de cursores fantasma se testea sin
red, sin servidor y sin navegador — que es exactamente el motivo de tenerla aquí y no
dentro de un componente de React.

`packages/canvas-core/test/presence.test.ts`:

```typescript
import { expect, test } from 'vitest'
import { CURSOR_TTL_MS, staleClientIds } from '../src/presence.js'

test('no purga a nadie cuando todos son recientes', () => {
  const now = 100_000
  const seen = new Map([
    [1, now - 1_000],
    [2, now - 5_000],
  ])
  expect(staleClientIds(seen, now)).toEqual([])
})

test('purga solo a quien excede el TTL', () => {
  const now = 100_000
  const seen = new Map([
    [1, now - 1_000],
    [2, now - CURSOR_TTL_MS - 1],
    [3, now - CURSOR_TTL_MS - 60_000],
  ])
  expect(staleClientIds(seen, now).sort()).toEqual([2, 3])
})

test('el umbral es exclusivo: exactamente en el TTL todavía no se purga', () => {
  const now = 100_000
  const seen = new Map([[1, now - CURSOR_TTL_MS]])
  expect(staleClientIds(seen, now)).toEqual([])
})

test('acepta un TTL propio para poder testear sin esperas', () => {
  const now = 1_000
  const seen = new Map([[7, 400]])
  expect(staleClientIds(seen, now, 500)).toEqual([7])
})

test('un mapa vacío no purga nada', () => {
  expect(staleClientIds(new Map(), 1_000)).toEqual([])
})
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test presence`
Expected: FAIL, no resuelve `../src/presence.js`.

- [ ] **Step 3: Escribir `packages/canvas-core/src/presence.ts`**

```typescript
import type { ShapeId } from './types.js'

/**
 * Coincide con el `timeout` del servidor Hocuspocus a propósito: si el servidor corta la
 * conexión a los 30 s sin pong, el cliente no debería seguir pintando ese cursor más
 * tiempo del que el servidor tarda en confirmarlo.
 */
export const CURSOR_TTL_MS = 30_000

export interface Presence {
  name: string
  color: string
  cursor: { x: number; y: number } | null
  selection: ShapeId[]
  /** Posición provisional durante un arrastre en curso. No se persiste en el documento. */
  dragging: Record<ShapeId, { x: number; y: number }> | null
}

/**
 * Los timestamps son de recepción local, no del emisor: los relojes de clientes distintos
 * no están sincronizados y usar el reloj remoto haría que un cliente con la hora adelantada
 * pareciera eternamente vivo.
 */
export function staleClientIds(
  lastSeen: ReadonlyMap<number, number>,
  now: number,
  ttlMs: number = CURSOR_TTL_MS,
): number[] {
  const stale: number[] = []
  for (const [clientId, seenAt] of lastSeen) {
    if (now - seenAt > ttlMs) stale.push(clientId)
  }
  return stale
}
```

- [ ] **Step 4: Añadir el export al `index.ts`**

Modify: `packages/canvas-core/src/index.ts`. Añade la línea al final:

```typescript
export * from './presence.js'
```

- [ ] **Step 5: Ejecutar toda la suite del paquete y verla pasar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test`
Expected: PASS, 16 tests (6 de z-index, 5 de convergencia, 5 de presencia).

- [ ] **Step 6: Verificar el typecheck del paquete**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core typecheck`
Expected: sin errores.

- [ ] **Step 7: Verificar la restricción de aislamiento**

Run: `docker compose run --rm api sh -c "grep -rn 'react\|konva\|document\.\|window\.' packages/canvas-core/src || echo 'LIMPIO'"`
Expected: `LIMPIO`. Si aparece algo, el paquete ha perdido su propiedad más valiosa y hay
que sacarlo antes de continuar.

- [ ] **Step 8: Commit**

```bash
git add packages/canvas-core
git commit -m "feat(canvas-core): lectura ordenada de formas y GC de presencia"
```

---

### Task 9: `web` — documento conectado y stage con tres capas

**Files:**
- Create: `apps/web/src/canvas/useCanvasDoc.ts`, `apps/web/src/canvas/CanvasStage.tsx`, `apps/web/src/canvas/ShapeNode.tsx`
- Create: `playwright.config.ts`, `e2e/render.spec.ts`, `e2e/helpers.ts`
- Modify: `apps/web/package.json` (dependencias de canvas), `apps/web/src/App.tsx`
- Modify: `compose.yaml` (servicio `e2e`)

**Interfaces:**
- Consumes: `readShapes`, `Shape`, `Presence`, `addShape` de `@canvas/canvas-core`; el servicio `sync` (Task 4).
- Produces:
  - `useCanvasDoc(boardId: string): { doc: Y.Doc; provider: HocuspocusProvider | null; shapes: Shape[]; status: ConnectionStatus }`
  - `type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'`
  - `<CanvasStage boardId={string} />`
  - `window.__canvas.readShapes(): Shape[]` en modo dev, para que los E2E puedan afirmar sobre el estado
  - Capas Konva con `name` estable: `layer-static`, `layer-interaction`, `layer-overlay`

- [ ] **Step 1: Añadir dependencias a `apps/web/package.json`**

Modify: en `dependencies`, añade:

```json
    "@canvas/canvas-core": "workspace:*",
    "@hocuspocus/provider": "4.4.0",
    "konva": "10.3.0",
    "react-konva": "19.2.5",
    "yjs": "13.6.31"
```

En `devDependencies`, añade:

```json
    "@playwright/test": "1.62.1"
```

- [ ] **Step 2: Añadir el servicio `e2e` al compose**

Modify: `compose.yaml`, como servicio nuevo. El perfil `test` evita que arranque con
`docker compose up`; la imagen oficial de Playwright trae los navegadores ya instalados,
así que la imagen de desarrollo no engorda con ellos.

```yaml
  e2e:
    image: mcr.microsoft.com/playwright:v1.62.1-noble
    profiles: ['test']
    working_dir: /workspace
    volumes:
      - .:/workspace
    environment:
      E2E_BASE_URL: http://web:5173
      SYNC_URL: ws://sync:1234
      DATABASE_URL: postgres://canvas:canvas@postgres:5432/canvas
    depends_on:
      - web
      - sync
    command: pnpm exec playwright test
```

- [ ] **Step 3: Crear `playwright.config.ts` en la raíz**

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Los tests comparten board y servidor de sync: en paralelo se interfieren.
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
})
```

- [ ] **Step 4: Crear `e2e/helpers.ts`**

```typescript
import type { Page } from '@playwright/test'
import type { Shape } from '@canvas/canvas-core'

declare global {
  interface Window {
    __canvas?: { readShapes: () => Shape[] }
  }
}

export function boardUrl(boardId: string): string {
  return `/?board=${boardId}`
}

/** Lee el estado del documento desde el navegador, sin depender de píxeles. */
export async function shapesIn(page: Page): Promise<Shape[]> {
  return page.evaluate(() => window.__canvas!.readShapes())
}

export async function waitForShapeCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => (window.__canvas?.readShapes().length ?? -1) === expected,
    count,
    { timeout: 15_000 },
  )
}
```

- [ ] **Step 5: Escribir el test E2E que falla**

Siembra la forma desde un cliente Node y comprueba que el navegador la recibe y la pinta.
Verifica el camino servidor → cliente sin depender todavía de la UI de creación.

`e2e/render.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { WebSocket } from 'ws'
import { addShape } from '@canvas/canvas-core'
import { boardUrl, shapesIn, waitForShapeCount } from './helpers.js'

const BOARD = 'e2e-render'

test('una forma sembrada desde otro cliente aparece en el navegador', async ({ page }) => {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: process.env.SYNC_URL ?? 'ws://localhost:1234',
    name: BOARD,
    document: doc,
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  })
  await new Promise<void>((resolve) => provider.on('synced', () => resolve()))

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
  await page.waitForFunction(() => (window.__canvas?.layerNames().length ?? 0) === 3, undefined, {
    timeout: 10_000,
  })
  expect(await page.evaluate(() => window.__canvas!.layerNames())).toEqual([
    'layer-static',
    'layer-interaction',
    'layer-overlay',
  ])
})
```

- [ ] **Step 6: Ejecutar el test y verlo fallar**

Run: `docker compose up -d && docker compose run --rm e2e pnpm exec playwright test render`
Expected: FAIL. `window.__canvas` no existe y no hay ningún `<canvas>`.

- [ ] **Step 7: Escribir `apps/web/src/canvas/useCanvasDoc.ts`**

```typescript
import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { readShapes, type Shape } from '@canvas/canvas-core'

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
    const next = new HocuspocusProvider({
      url: import.meta.env.VITE_SYNC_URL ?? 'ws://localhost:1234',
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
      window.__canvas = { ...window.__canvas, readShapes: () => readShapes(doc) }
    }

    return () => {
      doc.off('update', onUpdate)
      next.destroy()
      setProvider(null)
      if (import.meta.env.DEV) {
        delete window.__canvasDoc
        delete window.__canvas
      }
    }
  }, [boardId, doc])

  return { doc, provider, shapes, status }
}
```

`window.__canvasDoc` no es decorativo: el test de la Task 11 cuenta los updates del
documento suscribiéndose a él, y sin esta línea recibiría `undefined`.

- [ ] **Step 8: Escribir `apps/web/src/canvas/ShapeNode.tsx`**

```tsx
import { Ellipse, Line, Rect, Text } from 'react-konva'
import type { Shape } from '@canvas/canvas-core'

export interface ShapeNodeProps {
  shape: Shape
  selected: boolean
  onSelect: (id: string) => void
  draggable: boolean
}

export function ShapeNode({ shape, selected, onSelect, draggable }: ShapeNodeProps) {
  const common = {
    id: shape.id,
    rotation: shape.rotation,
    draggable,
    onMouseDown: () => onSelect(shape.id),
    stroke: selected ? '#5e81ac' : shape.stroke,
    strokeWidth: selected ? 3 : 1,
  }

  switch (shape.type) {
    case 'rect':
      return <Rect {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={shape.fill} />

    case 'ellipse':
      // Konva centra la elipse en (x,y); el modelo guarda la esquina de la caja, así que
      // hay que desplazar medio ancho y medio alto.
      return (
        <Ellipse
          {...common}
          x={shape.x + shape.w / 2}
          y={shape.y + shape.h / 2}
          radiusX={shape.w / 2}
          radiusY={shape.h / 2}
          fill={shape.fill}
        />
      )

    case 'text':
      return <Text {...common} x={shape.x} y={shape.y} width={shape.w} text={shape.text} fontSize={18} fill={shape.stroke} />

    case 'arrow':
      return <Line {...common} x={shape.x} y={shape.y} points={[0, 0, shape.w, shape.h]} strokeWidth={selected ? 4 : 2} />
  }
}
```

- [ ] **Step 9: Escribir `apps/web/src/canvas/CanvasStage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { ShapeId } from '@canvas/canvas-core'
import { ShapeNode } from './ShapeNode.js'
import { useCanvasDoc } from './useCanvasDoc.js'

export interface CanvasStageProps {
  boardId: string
}

export function CanvasStage({ boardId }: CanvasStageProps) {
  const { shapes, status } = useCanvasDoc(boardId)
  const [selected, setSelected] = useState<ShapeId | null>(null)
  const stageRef = useRef<Konva.Stage>(null)

  // Completa el puente de test con los nombres de capa leídos del Stage real. Va aquí
  // porque este componente es el dueño del Stage; useCanvasDoc no lo conoce.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = {
      ...window.__canvas!,
      layerNames: () => stageRef.current?.getLayers().map((layer) => layer.name()) ?? [],
    }
  }, [])

  return (
    <Stage
      ref={stageRef}
      width={window.innerWidth}
      height={window.innerHeight - 48}
      data-status={status}
    >
      {/* Tres capas separadas para que un cursor remoto no repinte las formas en reposo. */}
      <Layer name="layer-static">
        {shapes.map((shape) => (
          <ShapeNode
            key={shape.id}
            shape={shape}
            selected={shape.id === selected}
            onSelect={setSelected}
            draggable={false}
          />
        ))}
      </Layer>
      <Layer name="layer-interaction" />
      <Layer name="layer-overlay" />
    </Stage>
  )
}
```

- [ ] **Step 10: Reescribir `apps/web/src/App.tsx`**

`App` solo resuelve qué board se abre. El puente de test vive en `useCanvasDoc`, que es
quien posee el documento.

```tsx
import { CanvasStage } from './canvas/CanvasStage.js'

function boardIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('board') ?? 'demo'
}

export function App() {
  const boardId = boardIdFromUrl()

  return (
    <>
      <header style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
        <strong>Lienzo colaborativo</strong>
      </header>
      <CanvasStage boardId={boardId} />
    </>
  )
}
```

> La Task 10 vuelve a tocar este fichero: `CanvasStage` pasará a montar su propia
> cabecera con la toolbar, y esta se elimina de aquí.

- [ ] **Step 11: Declarar el tipo global del puente**

Create: `apps/web/src/global.d.ts`

```typescript
import type { Shape } from '@canvas/canvas-core'
import type * as Y from 'yjs'

declare global {
  interface Window {
    __canvas?: {
      readShapes: () => Shape[]
      layerNames: () => string[]
    }
    __canvasDoc?: Y.Doc
  }
}
```

- [ ] **Step 12: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm e2e pnpm exec playwright test render`
Expected: PASS, 2 tests.

Los dos puntos donde este test suele fallar y qué significa cada uno: si `layerNames`
devuelve `[]`, el `useEffect` del puente corrió antes de que el Stage montara —
comprueba que `stageRef` está pasado al `<Stage>`. Si devuelve menos de tres nombres,
falta una `<Layer>` o alguna no tiene `name`. En ninguno de los dos casos se ajusta la
aserción: el spec pide tres capas nombradas y el test las exige.

- [ ] **Step 13: Commit**

```bash
git add apps/web playwright.config.ts e2e compose.yaml
git commit -m "feat(web): documento conectado y stage Konva con tres capas"
```

---

### Task 10: `web` — toolbar, creación de formas y selección

**Files:**
- Create: `apps/web/src/toolbar/Toolbar.tsx`
- Modify: `apps/web/src/canvas/CanvasStage.tsx`, `apps/web/src/App.tsx`
- Create: `e2e/create-shapes.spec.ts`

**Interfaces:**
- Consumes: `addShape`, `NewShape`, `deleteShapes` de `@canvas/canvas-core`; `useCanvasDoc` (Task 9).
- Produces:
  - `<Toolbar onCreate={(type: ShapeType) => void} onDelete={() => void} canDelete={boolean} />`
  - Botones con `data-testid`: `tool-rect`, `tool-ellipse`, `tool-text`, `tool-arrow`, `tool-delete`

- [ ] **Step 1: Escribir el test E2E que falla**

`e2e/create-shapes.spec.ts`:

```typescript
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
  await a.close()
  await b.close()
})
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm e2e pnpm exec playwright test create-shapes`
Expected: FAIL, no existen los `data-testid`.

- [ ] **Step 3: Escribir `apps/web/src/toolbar/Toolbar.tsx`**

```tsx
import type { ShapeType } from '@canvas/canvas-core'

export interface ToolbarProps {
  onCreate: (type: ShapeType) => void
  onDelete: () => void
  canDelete: boolean
}

const TOOLS: Array<{ type: ShapeType; label: string }> = [
  { type: 'rect', label: 'Rectángulo' },
  { type: 'ellipse', label: 'Círculo' },
  { type: 'text', label: 'Texto' },
  { type: 'arrow', label: 'Flecha' },
]

export function Toolbar({ onCreate, onDelete, canDelete }: ToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {TOOLS.map(({ type, label }) => (
        <button key={type} data-testid={`tool-${type}`} onClick={() => onCreate(type)}>
          {label}
        </button>
      ))}
      <button data-testid="tool-delete" onClick={onDelete} disabled={!canDelete}>
        Borrar
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Conectar la toolbar en `CanvasStage.tsx`**

Modify: `apps/web/src/canvas/CanvasStage.tsx`. Sustituye el componente entero:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import { addShape, deleteShapes, type ShapeId, type ShapeType } from '@canvas/canvas-core'
import { ShapeNode } from './ShapeNode.js'
import { useCanvasDoc } from './useCanvasDoc.js'
import { Toolbar } from '../toolbar/Toolbar.js'

const HEADER_HEIGHT = 48

/** Tamaños por defecto al crear. La elipse es cuadrada para que el botón "círculo" lo sea. */
const DEFAULTS: Record<ShapeType, { w: number; h: number; text?: string }> = {
  rect: { w: 160, h: 100 },
  ellipse: { w: 120, h: 120 },
  text: { w: 200, h: 32, text: 'Texto' },
  arrow: { w: 140, h: 90 },
}

export interface CanvasStageProps {
  boardId: string
}

export function CanvasStage({ boardId }: CanvasStageProps) {
  const { doc, shapes, status } = useCanvasDoc(boardId)
  const [selected, setSelected] = useState<ShapeId | null>(null)
  const stageRef = useRef<Konva.Stage>(null)

  // Se conserva de la Task 9: el test de las tres capas depende de este puente.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = {
      ...window.__canvas!,
      layerNames: () => stageRef.current?.getLayers().map((layer) => layer.name()) ?? [],
    }
  }, [])

  const handleCreate = useCallback(
    (type: ShapeType) => {
      const { w, h, text } = DEFAULTS[type]
      // Desplazamiento por número de formas para que no se apilen exactamente encima.
      const offset = shapes.length * 24
      addShape(doc, { type, x: 60 + offset, y: 60 + offset, w, h, text })
    },
    [doc, shapes.length],
  )

  const handleDelete = useCallback(() => {
    if (!selected) return
    deleteShapes(doc, [selected])
    setSelected(null)
  }, [doc, selected])

  return (
    <>
      <header style={{ height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', gap: 16, padding: '0 12px' }}>
        <strong>Lienzo colaborativo</strong>
        <Toolbar onCreate={handleCreate} onDelete={handleDelete} canDelete={selected !== null} />
        <span data-testid="connection-status">{status}</span>
      </header>

      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight - HEADER_HEIGHT}
      >
        <Layer name="layer-static">
          {shapes.map((shape) => (
            <ShapeNode
              key={shape.id}
              shape={shape}
              selected={shape.id === selected}
              onSelect={setSelected}
              draggable={false}
            />
          ))}
        </Layer>
        <Layer name="layer-interaction" />
        <Layer name="layer-overlay" />
      </Stage>
    </>
  )
}
```

- [ ] **Step 5: Simplificar `App.tsx`**

`CanvasStage` ya monta la cabecera, así que `App` solo resuelve el board.

```tsx
import { CanvasStage } from './canvas/CanvasStage.js'

function boardIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('board') ?? 'demo'
}

export function App() {
  return <CanvasStage boardId={boardIdFromUrl()} />
}
```

- [ ] **Step 6: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm e2e pnpm exec playwright test create-shapes`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web e2e
git commit -m "feat(web): toolbar con las cuatro formas primitivas y selección"
```

---

### Task 11: `web` — arrastre en tres carriles

**Files:**
- Create: `apps/web/src/canvas/useDragCommit.ts`
- Modify: `apps/web/src/canvas/CanvasStage.tsx`, `apps/web/src/canvas/ShapeNode.tsx`
- Create: `e2e/drag.spec.ts`

**Interfaces:**
- Consumes: `updateShape` de `@canvas/canvas-core`; `useCanvasDoc` (Task 9).
- Produces:
  - `useDragCommit(doc: Y.Doc, provider: HocuspocusProvider | null): { onDragMove: (id: ShapeId, x: number, y: number) => void; onDragEnd: (id: ShapeId, x: number, y: number) => void }`
  - `DRAG_THROTTLE_MS = 40`

- [ ] **Step 1: Escribir el test E2E que falla**

Lo que hay que demostrar es doble: la posición final se propaga, y **no** se escriben
cientos de updates durante el gesto.

`e2e/drag.spec.ts`:

```typescript
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
    (originalX) => (window.__canvas?.readShapes()[0]?.x ?? originalX) > originalX + 150,
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
  }
  await page.mouse.up()

  const updates = await page.evaluate(() => window.__updateCount)
  // 20 movimientos de ratón: un modelo ingenuo produciría ~20 updates. El commit al
  // soltar produce 1. Se admite algo de margen por si Yjs parte la transacción.
  expect(updates).toBeLessThanOrEqual(3)
})
```

- [ ] **Step 2: Añadir `__updateCount` al tipo global**

Modify: `apps/web/src/global.d.ts`, dentro de `interface Window`:

```typescript
    __updateCount?: number
```

- [ ] **Step 3: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm e2e pnpm exec playwright test drag`
Expected: FAIL. Las formas no son arrastrables todavía (`draggable={false}`).

- [ ] **Step 4: Escribir `apps/web/src/canvas/useDragCommit.ts`**

```typescript
import { useCallback, useRef } from 'react'
import type * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { updateShape, type Presence, type ShapeId } from '@canvas/canvas-core'

/** Cadencia de la posición provisional por awareness. Ver §5.2 del spec. */
export const DRAG_THROTTLE_MS = 40

export interface DragHandlers {
  onDragMove: (id: ShapeId, x: number, y: number) => void
  onDragEnd: (id: ShapeId, x: number, y: number) => void
}

/**
 * Los tres carriles del arrastre:
 *   1. Konva mueve su propio nodo (no pasa por aquí y por eso va a 60fps).
 *   2. Aquí se publica la posición provisional por awareness, con throttle.
 *   3. Al soltar, una única escritura en el documento.
 * Escribir en Yjs en cada mousemove inflaría el documento y saturaría la red.
 */
export function useDragCommit(doc: Y.Doc, provider: HocuspocusProvider | null): DragHandlers {
  const lastPublished = useRef(0)

  const onDragMove = useCallback(
    (id: ShapeId, x: number, y: number) => {
      if (!provider) return

      const now = performance.now()
      if (now - lastPublished.current < DRAG_THROTTLE_MS) return
      lastPublished.current = now

      const current = provider.awareness?.getLocalState() as Presence | null
      provider.awareness?.setLocalStateField('dragging', {
        ...(current?.dragging ?? {}),
        [id]: { x, y },
      })
    },
    [provider],
  )

  const onDragEnd = useCallback(
    (id: ShapeId, x: number, y: number) => {
      updateShape(doc, id, { x, y })
      // Limpiar el carril efímero: si se queda, los demás verían la forma en dos sitios.
      provider?.awareness?.setLocalStateField('dragging', null)
      lastPublished.current = 0
    },
    [doc, provider],
  )

  return { onDragMove, onDragEnd }
}
```

- [ ] **Step 5: Hacer las formas arrastrables en `ShapeNode.tsx`**

Modify: `apps/web/src/canvas/ShapeNode.tsx`. Amplía `ShapeNodeProps` y `common`:

```tsx
export interface ShapeNodeProps {
  shape: Shape
  selected: boolean
  onSelect: (id: string) => void
  draggable: boolean
  onDragMove: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
}
```

Y dentro del componente, añade a `common`:

```tsx
    onDragMove: (e: KonvaEventObject<DragEvent>) => onDragMove(shape.id, e.target.x(), e.target.y()),
    onDragEnd: (e: KonvaEventObject<DragEvent>) => onDragEnd(shape.id, e.target.x(), e.target.y()),
```

Añade el import del tipo del evento:

```tsx
import type { KonvaEventObject } from 'konva/lib/Node'
```

> Para la elipse, `e.target.x()` devuelve el **centro**, porque es como Konva la posiciona.
> Convierte a esquina antes de propagar: `onDragEnd(shape.id, e.target.x() - shape.w / 2, e.target.y() - shape.h / 2)`.
> Si no lo haces, cada arrastre de una elipse la desplazará media caja.

- [ ] **Step 6: Conectar el drag en `CanvasStage.tsx`**

Modify: `apps/web/src/canvas/CanvasStage.tsx`:

- Importa el hook: `import { useDragCommit } from './useDragCommit.js'`
- Extrae `provider` del hook: `const { doc, provider, shapes, status } = useCanvasDoc(boardId)`
- Crea los handlers: `const drag = useDragCommit(doc, provider)`
- Pasa a cada `<ShapeNode>`: `draggable`, `onDragMove={drag.onDragMove}` y `onDragEnd={drag.onDragEnd}`

- [ ] **Step 7: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm e2e pnpm exec playwright test drag`
Expected: PASS, 2 tests. Si el conteo de updates supera 3, es que algo escribe en el doc
durante el `dragmove`: busca un `updateShape` fuera de `onDragEnd`.

- [ ] **Step 8: Commit**

```bash
git add apps/web e2e
git commit -m "feat(web): arrastre en tres carriles con commit único al soltar"
```

---

### Task 12: `web` — cursores remotos interpolados y purga de fantasmas

**Files:**
- Create: `apps/web/src/canvas/CursorOverlay.tsx`, `apps/web/src/canvas/useRemotePresence.ts`
- Modify: `apps/web/src/canvas/CanvasStage.tsx`
- Create: `e2e/cursors.spec.ts`

**Interfaces:**
- Consumes: `Presence`, `staleClientIds`, `CURSOR_TTL_MS` de `@canvas/canvas-core`; `useCanvasDoc` (Task 9).
- Produces:
  - `useRemotePresence(provider: HocuspocusProvider | null): RemoteCursor[]`
  - `interface RemoteCursor { clientId: number; name: string; color: string; x: number; y: number }`
  - `<CursorOverlay cursors={RemoteCursor[]} />` — pinta en `layer-overlay`
  - `window.__canvas.remoteCursorCount(): number` en dev

- [ ] **Step 1: Escribir el test E2E que falla**

El caso que importa es el **cierre abrupto**: `page.close()` sin desconexión limpia. Es la
partición de red del spec en pequeño.

`e2e/cursors.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'
import { boardUrl } from './helpers.js'

async function cursorCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__canvas!.remoteCursorCount())
}

test('el cursor del otro usuario aparece al moverse', async ({ browser }) => {
  const board = boardUrl(`e2e-cursor-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.mouse.move(300, 300)
  await a.mouse.move(320, 310)

  await b.waitForFunction(() => window.__canvas!.remoteCursorCount() === 1, undefined, {
    timeout: 10_000,
  })
  expect(await cursorCount(b)).toBe(1)

  await a.close()
  await b.close()
})

test('el cursor desaparece cuando el otro cierra sin despedirse', async ({ browser }) => {
  const board = boardUrl(`e2e-ghost-${Date.now()}`)
  const a = await browser.newPage()
  const b = await browser.newPage()
  await a.goto(board)
  await b.goto(board)

  await a.mouse.move(200, 200)
  await b.waitForFunction(() => window.__canvas!.remoteCursorCount() === 1, undefined, {
    timeout: 10_000,
  })

  await a.close()

  // El cierre del contexto termina el socket, y el awareness se purga al propagarse.
  // Si esto falla, revisa que el provider no se esté quedando sin destruir.
  await b.waitForFunction(() => window.__canvas!.remoteCursorCount() === 0, undefined, {
    timeout: 15_000,
  })
  expect(await cursorCount(b)).toBe(0)

  await b.close()
})
```

- [ ] **Step 2: Ampliar el puente de test**

Modify: `apps/web/src/global.d.ts`:

```typescript
    __canvas?: {
      readShapes: () => Shape[]
      layerNames: () => string[]
      remoteCursorCount: () => number
    }
```

- [ ] **Step 3: Ejecutar el test y verlo fallar**

Run: `docker compose run --rm e2e pnpm exec playwright test cursors`
Expected: FAIL, `remoteCursorCount` no es una función.

- [ ] **Step 4: Escribir `apps/web/src/canvas/useRemotePresence.ts`**

```typescript
import { useEffect, useRef, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { CURSOR_TTL_MS, staleClientIds, type Presence } from '@canvas/canvas-core'

export interface RemoteCursor {
  clientId: number
  name: string
  color: string
  x: number
  y: number
}

/** Cadencia de reevaluación del TTL. No hace falta más fino: el umbral es de 30 s. */
const SWEEP_INTERVAL_MS = 5_000

export function useRemotePresence(provider: HocuspocusProvider | null): RemoteCursor[] {
  const [cursors, setCursors] = useState<RemoteCursor[]>([])
  // Timestamps de recepción local, no del emisor: los relojes remotos no son fiables.
  const lastSeen = useRef(new Map<number, number>())

  useEffect(() => {
    const awareness = provider?.awareness
    if (!awareness) return

    const read = () => {
      const now = Date.now()
      const next: RemoteCursor[] = []

      for (const [clientId, raw] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue

        const state = raw as Presence
        if (state?.cursor) {
          lastSeen.current.set(clientId, now)
          next.push({
            clientId,
            name: state.name ?? 'anónimo',
            color: state.color ?? '#bf616a',
            x: state.cursor.x,
            y: state.cursor.y,
          })
        }
      }

      // Segunda defensa del spec: descartar por antigüedad sin esperar al servidor,
      // porque si cae la réplica que sostenía el socket muerto nadie emite la purga.
      const stale = new Set(staleClientIds(lastSeen.current, now, CURSOR_TTL_MS))
      for (const clientId of stale) lastSeen.current.delete(clientId)

      setCursors(next.filter((c) => !stale.has(c.clientId)))
    }

    awareness.on('change', read)
    const sweep = setInterval(read, SWEEP_INTERVAL_MS)
    read()

    return () => {
      awareness.off('change', read)
      clearInterval(sweep)
    }
  }, [provider])

  return cursors
}
```

- [ ] **Step 5: Escribir `apps/web/src/canvas/CursorOverlay.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { Group, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import type { RemoteCursor } from './useRemotePresence.js'

export interface CursorOverlayProps {
  cursors: RemoteCursor[]
}

/** Fracción del camino recorrida por frame. 0.2 da un seguimiento suave sin retraso visible. */
const LERP_FACTOR = 0.2

/**
 * Awareness llega a ~25Hz y la pantalla pinta a 60: sin interpolación los cursores se
 * mueven a saltos. Un único bucle rAF para todos, no uno por cursor.
 */
export function CursorOverlay({ cursors }: CursorOverlayProps) {
  const groups = useRef(new Map<number, Konva.Group>())
  const targets = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    for (const cursor of cursors) targets.current.set(cursor.clientId, { x: cursor.x, y: cursor.y })
  }, [cursors])

  useEffect(() => {
    let frame = 0

    const tick = () => {
      for (const [clientId, group] of groups.current) {
        const target = targets.current.get(clientId)
        if (!target) continue
        group.x(group.x() + (target.x - group.x()) * LERP_FACTOR)
        group.y(group.y() + (target.y - group.y()) * LERP_FACTOR)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <>
      {cursors.map((cursor) => (
        <Group
          key={cursor.clientId}
          ref={(node) => {
            if (node) groups.current.set(cursor.clientId, node)
            else groups.current.delete(cursor.clientId)
          }}
          x={cursor.x}
          y={cursor.y}
        >
          <Circle radius={5} fill={cursor.color} />
          <Text x={8} y={-4} text={cursor.name} fontSize={12} fill={cursor.color} />
        </Group>
      ))}
    </>
  )
}
```

- [ ] **Step 6: Publicar el cursor local y montar el overlay**

Modify: `apps/web/src/canvas/CanvasStage.tsx`:

- Importa: `useRemotePresence` y `CursorOverlay`
- Obtén los cursores: `const cursors = useRemotePresence(provider)`
- Publica la posición local en el `<Stage>`, con throttle de `DRAG_THROTTLE_MS`:

```tsx
  const lastCursor = useRef(0)

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const now = performance.now()
      if (now - lastCursor.current < DRAG_THROTTLE_MS) return
      lastCursor.current = now

      const point = e.target.getStage()?.getPointerPosition()
      if (point) provider?.awareness?.setLocalStateField('cursor', { x: point.x, y: point.y })
    },
    [provider],
  )
```

- Pasa `onMouseMove={handleMouseMove}` al `<Stage>`
- Monta el overlay en su capa: `<Layer name="layer-overlay"><CursorOverlay cursors={cursors} /></Layer>`
- Publica `name` y `color` una vez al conectar, para que el otro cliente tenga qué pintar:

```tsx
  useEffect(() => {
    if (!provider?.awareness) return
    const palette = ['#bf616a', '#a3be8c', '#ebcb8b', '#b48ead', '#88c0d0']
    provider.awareness.setLocalStateField('name', `usuario-${provider.awareness.clientID % 1000}`)
    provider.awareness.setLocalStateField('color', palette[provider.awareness.clientID % palette.length])
  }, [provider])
```

- [ ] **Step 7: Exponer `remoteCursorCount` en el puente**

Modify: el `useEffect` de `useCanvasDoc.ts` donde publicaste `window.__canvas`. El conteo
de cursores vive en `CanvasStage`, así que la forma limpia es que `CanvasStage` complete el
puente:

```tsx
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__canvas = { ...window.__canvas!, remoteCursorCount: () => cursors.length }
  }, [cursors.length])
```

- [ ] **Step 8: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm e2e pnpm exec playwright test cursors`
Expected: PASS, 2 tests.

- [ ] **Step 9: Commit**

```bash
git add apps/web e2e
git commit -m "feat(web): cursores remotos interpolados con purga de fantasmas"
```

---

### Task 13: Partición de red y cierre de la fase 1

**Files:**
- Create: `packages/canvas-core/test/partition.test.ts`
- Create: `e2e/offline.spec.ts`
- Create: `docs/arquitectura/flujo-de-sincronizacion.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la fase 1 cerrada y verificable.

- [ ] **Step 1: Escribir el test de partición en `canvas-core`**

Es el test que verifica la promesa central del CRDT, y se puede hacer sin red: una
partición es exactamente dos docs que no intercambian updates durante un rato.

`packages/canvas-core/test/partition.test.ts`:

```typescript
import { expect, test } from 'vitest'
import * as Y from 'yjs'
import { addShape, deleteShapes, updateShape } from '../src/operations.js'
import { readShapes } from '../src/selectors.js'

function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

test('dos clientes particionados convergen al reconectar', () => {
  const a = new Y.Doc()
  const b = new Y.Doc()

  const shared = addShape(a, { type: 'rect', x: 0, y: 0, w: 100, h: 100 }, 'shared')
  sync(a, b)

  // --- partición: ninguno ve al otro ---
  updateShape(a, shared, { x: 500 })
  addShape(a, { type: 'ellipse', x: 10, y: 10, w: 50, h: 50 }, 'only-a')

  updateShape(b, shared, { fill: '#00ff00' })
  addShape(b, { type: 'arrow', x: 20, y: 20, w: 80, h: 40 }, 'only-b')
  // --- reconexión ---
  sync(a, b)

  const fromA = readShapes(a)
  const fromB = readShapes(b)

  expect(fromA).toEqual(fromB)
  expect(fromA.map((s) => s.id)).toEqual(['shared', 'only-a', 'only-b'])

  const merged = fromA.find((s) => s.id === 'shared')!
  expect(merged.x).toBe(500)
  expect(merged.fill).toBe('#00ff00')
})

test('un borrado durante la partición se propaga al reconectar', () => {
  const a = new Y.Doc()
  const b = new Y.Doc()
  const id = addShape(a, { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'doomed')
  sync(a, b)

  deleteShapes(a, [id])
  updateShape(b, id, { x: 42 })
  sync(a, b)

  expect(readShapes(a)).toEqual([])
  expect(readShapes(b)).toEqual([])
})

test('tres réplicas convergen al mismo orden pese a crear a la vez', () => {
  const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()]

  docs.forEach((doc, index) => {
    addShape(doc, { type: 'rect', x: index, y: index, w: 10, h: 10 }, `from-${index}`)
  })

  // Malla completa, dos veces: la segunda pasada propaga lo que llegó en la primera.
  for (let round = 0; round < 2; round++) {
    for (const a of docs) for (const b of docs) if (a !== b) sync(a, b)
  }

  const orders = docs.map((doc) => readShapes(doc).map((s) => s.id))
  expect(orders[1]).toEqual(orders[0])
  expect(orders[2]).toEqual(orders[0])
  expect(orders[0]).toHaveLength(3)
})
```

- [ ] **Step 2: Ejecutar el test y verlo pasar**

Run: `docker compose run --rm api pnpm --filter @canvas/canvas-core test partition`
Expected: PASS, 3 tests. **Si el tercero falla**, el desempate de `compareZ` no está
funcionando: tres claves generadas a la vez sobre docs vacíos son idénticas (`a0`) y sin
el criterio por `id` cada réplica ordenaría distinto. Es exactamente el bug que el test
existe para atrapar.

- [ ] **Step 3: Escribir el E2E de reconexión**

`e2e/offline.spec.ts`:

```typescript
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
  expect(await shapesIn(b)).toHaveLength(1)

  await a.context().setOffline(false)
  await waitForShapeCount(b, 2)

  const idsA = (await shapesIn(a)).map((s) => s.id)
  const idsB = (await shapesIn(b)).map((s) => s.id)
  expect(idsB).toEqual(idsA)

  await a.close()
  await b.close()
})

test('el indicador de conexión refleja el estado real', async ({ page }) => {
  await page.goto(boardUrl(`e2e-status-${Date.now()}`))
  await expect(page.getByTestId('connection-status')).toHaveText('connected', { timeout: 10_000 })

  await page.context().setOffline(true)
  await expect(page.getByTestId('connection-status')).toHaveText('disconnected', { timeout: 15_000 })
})
```

- [ ] **Step 4: Ejecutar el E2E y verlo pasar**

Run: `docker compose run --rm e2e pnpm exec playwright test offline`
Expected: PASS, 2 tests. Sin `y-indexeddb` (fase 3) el documento vive en memoria, así que
recargar la página durante el offline **sí** pierde los cambios: no añadas un `reload()` a
este test.

- [ ] **Step 5: Ejecutar la suite completa**

Run: `docker compose run --rm api pnpm -r test`
Expected: PASS. `@canvas/canvas-core` 19 tests, `@canvas/schema` 3, `api` 3, `sync` 3.
Run: `docker compose run --rm e2e pnpm exec playwright test`
Expected: PASS, 12 tests E2E.
Run: `docker compose run --rm api pnpm -r typecheck`
Expected: sin errores.

- [ ] **Step 6: Escribir `docs/arquitectura/flujo-de-sincronizacion.md`**

Documentación viva: describe el estado **actual**, no el plan. Lo que no esté implementado
no se menciona como si existiera.

```markdown
# Flujo de sincronización

Estado actual: fase 1 (MVP). Sin autenticación ni persistencia local.

## Piezas

- `packages/canvas-core` — el documento Yjs y sus operaciones. No conoce React ni Konva,
  así que la convergencia se verifica en Node puro.
- `apps/sync` — Hocuspocus. Persiste snapshots en `board_docs` con debounce de 2 s
  (techo de 10 s) y corta conexiones sin pong a los 30 s.
- `apps/web` — React y Konva. Tres capas: formas en reposo, interacción, cursores.

## Un cambio, de punta a punta

1. El usuario suelta una forma tras arrastrarla.
2. `updateShape` escribe **una** transacción en el `Y.Doc` local.
3. `HocuspocusProvider` envía el update por WebSocket.
4. `sync` aplica, difunde al resto de la sala y programa el snapshot.
5. Los otros clientes reciben el update, `readShapes` recalcula y Konva repinta.

## Por qué el arrastre no pasa por el documento

Escribir en Yjs en cada `mousemove` produciría cientos de updates por segundo. Durante el
gesto, Konva mueve su nodo y la posición provisional viaja por **awareness** (efímero,
throttle de 40 ms). El documento solo recibe la posición final.

## Orden de pintado

No hay lista de orden compartida: cada forma tiene un `zIndex` de índice fraccionario y el
comparador desempata por `id`. Dos clientes que insertan en el mismo hueco pueden generar
la misma clave, y sin el desempate ordenarían distinto sobre un estado convergente.

## Cursores

Awareness llega a ~25 Hz y la pantalla pinta a 60: los cursores se interpolan con lerp en
un único bucle `requestAnimationFrame`. Se descartan los que llevan más de 30 s sin
actualizarse, sin esperar la confirmación del servidor.
```

- [ ] **Step 7: Añadir el documento al índice**

Modify: `docs/README.md`. En «Documentación viva», sustituye la línea de `arquitectura/`
por la entrada real:

```markdown
- [Flujo de sincronización](arquitectura/flujo-de-sincronizacion.md) — cómo viaja un cambio del navegador al resto de la sala, por qué el arrastre no pasa por el documento y cómo se ordena el pintado.
```

- [ ] **Step 8: Commit**

```bash
git add packages/canvas-core e2e docs
git commit -m "test: partición de red y reconexión; cierre de la fase 1"
```

---

## Verificación de cierre de las fases 0 y 1

Ejecuta esto y **lee la salida** antes de declarar nada terminado:

- [ ] `docker compose up -d && docker compose ps` → cinco servicios, `postgres`/`redis`/`api` healthy
- [ ] `docker compose run --rm api pnpm -r test` → 28 tests unitarios y de integración
- [ ] `docker compose run --rm e2e pnpm exec playwright test` → 12 tests E2E
- [ ] `docker compose run --rm api pnpm -r typecheck` → sin errores
- [ ] `docker compose run --rm api sh -c "grep -rn 'react\|konva' packages/canvas-core/src || echo LIMPIO"` → `LIMPIO`
- [ ] Abrir dos navegadores en `localhost:5173/?board=demo`, crear formas en uno y verlas en el otro con los cursores moviéndose

Criterios del spec para la fase 1: dos navegadores editan sin conflicto ✓, cursores suaves
✓, test de partición de red ✓.

## Qué queda fuera de este plan

Con orden sugerido, cada uno con su propio plan:

1. **Fase 2 — Producto:** Better Auth, dashboard de boards, roles, JWT de sala,
   `revoke_user` por Redis y la marca `revoked:`. Es la fase que convierte la demo en
   producto y la que más código de servidor añade.
2. **Fase 3 — Pulido:** `y-indexeddb`, undo/redo con el escenario de §8.1, export PNG/SVG,
   thumbnails y el árbol DOM espejo de accesibilidad.
3. **Fase 4 — Operación:** VPS, TLS, backups, dos réplicas de `sync` y el benchmark.

Dos deudas que este plan contrae a conciencia y que hay que pagar en la fase 2:

- **`boards.ownerId` es nullable.** La fase 1 crea boards sin usuarios. Pasa a `NOT NULL`
  cuando exista la tabla de usuarios.
- **Los Dockerfiles de producción no existen.** Las tres apps corren con la imagen de
  desarrollo. Se escriben en la fase 4, cuando haya un deploy que los consuma.
