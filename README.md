# collab-canvas-crdt

Lienzo infinito colaborativo en tiempo real, estilo Figma/Miro: varias personas dibujan y
editan el mismo documento a la vez, sin conflictos de estado, con cursores multijugador
interpolados y funcionamiento offline con sincronización posterior.

La sincronización usa **CRDT** (Yjs), así que no hay bloqueos ni un servidor que decida
quién gana: los cambios concurrentes convergen por construcción.

## Estado

**En construcción.** El proyecto avanza por fases y ahora mismo está a mitad de la fase 0
de 4. Lo que funciona hoy:

| Pieza | Estado |
|---|---|
| Infraestructura contenedorizada (5 servicios) | funciona |
| `@canvas/schema` — esquema Postgres con Drizzle | funciona, 4 tests |
| `api` — servicio HTTP con Hono y `/health` real | funciona, 3 tests |
| `sync` — servidor Hocuspocus con persistencia | pendiente |
| `web` — el lienzo (React + Konva) | pendiente |

El plan completo de las fases 0 y 1, con sus 13 tareas y los criterios de aceptación de
cada una, está en [docs/](docs/README.md).

## Stack

Todas las versiones se verificaron contra el registro de paquetes, no se eligieron de
memoria.

| Capa | Elección |
|---|---|
| CRDT | **Yjs** 13 |
| Servidor de sincronización | **Hocuspocus** 4.4 (WebSocket, awareness, escalado con Redis) |
| Lienzo | **Konva** + react-konva 19 |
| Frontend | **React** 19 + **Vite** 8 (Rolldown) |
| API | **Hono** 4 |
| Base de datos | **Postgres** 18.4 + **Drizzle** |
| Pub/sub | **Redis** 8.8 |
| Runtime | **Node** 24 LTS · TypeScript 7 |
| Tests | Vitest 4 · Playwright |

Los motivos de cada elección —y de cada descarte, como Fabric.js o tldraw— están razonados
en el [documento de diseño](docs/superpowers/specs/2026-07-30-lienzo-colaborativo-crdt-design.md).

## Arrancar

Requisito único: Docker (probado con OrbStack). **No necesitas Node instalado**, todo corre
en contenedores.

```bash
docker compose up -d
docker compose ps          # los cinco servicios
```

- API: http://localhost:3001/health
- Web: http://localhost:5173 *(cuando la fase 0 esté completa)*
- Sync: `ws://localhost:1234`

Los tests, también dentro del contenedor:

```bash
docker compose run --rm api pnpm -r test
```

## Estructura

```
apps/
  web/          SPA del editor (Vite + React + react-konva)
  api/          Hono: sesiones, salas, permisos
  sync/         Hocuspocus: merge CRDT, awareness, persistencia
packages/
  canvas-core/  documento Yjs y operaciones — sin React ni Konva
  schema/       esquema Drizzle y cliente de Postgres
docs/           diseño, plan de implementación y guías
```

`canvas-core` no importa React ni Konva a propósito: así la convergencia CRDT se verifica
en Node puro, sin navegador, y queda abierta la posibilidad de sustituir el renderer por un
motor WebGL sin tocar la lógica de estado.

## Licencia

[MIT](LICENSE) © Álvaro Ortí Segovia
