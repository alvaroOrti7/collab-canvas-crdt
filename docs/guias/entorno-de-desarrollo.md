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
    pnpm --filter @canvas/schema test         # un paquete
    pnpm --filter @canvas/schema db:generate  # migración tras cambiar tablas
    pnpm --filter @canvas/schema db:migrate   # aplicarla

## Base de datos

    docker compose exec postgres psql -U canvas -d canvas
