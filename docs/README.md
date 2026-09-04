# Índice de documentación

Una línea por documento. Documento nuevo → subcarpeta correspondiente + línea aquí, en
el mismo commit. Si no está en este índice, no existe.

## Artefactos e histórico

Fotos de un momento concreto. No se actualizan y no describen el estado actual del
sistema.

- [Diseño: Lienzo colaborativo en tiempo real con CRDT](superpowers/specs/2026-07-30-lienzo-colaborativo-crdt-design.md) — spec aprobado del proyecto: stack verificado, arquitectura de cinco servicios, modelo de datos Yjs y fases de entrega.
- [Plan: fases 0 y 1 — andamio y MVP](superpowers/plans/2026-07-30-fases-0-1-andamio-y-mvp.md) — 13 tareas con TDD paso a paso, desde el devcontainer hasta el lienzo colaborativo con cursores y test de partición de red.

## Documentación viva

- [Flujo de sincronización](arquitectura/flujo-de-sincronizacion.md) — cómo viaja un cambio del navegador al resto de la sala, por qué el arrastre no pasa por el documento y cómo se ordena el pintado.
- `referencia/` — qué existe y qué garantiza: esquema de datos, endpoints, variables de entorno
- [Guía: entorno de desarrollo](guias/entorno-de-desarrollo.md) — arrancar los cinco servicios, trabajar dentro del devcontainer y comandos habituales.
