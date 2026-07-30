# Diseño: Lienzo colaborativo en tiempo real con CRDT

> **Artefacto.** Foto del diseño acordado el 2026-07-30. Se congela en cuanto arranque la
> implementación: desde ese punto, un cambio de diseño es un spec nuevo y no una edición
> de este. Mientras siga en revisión, sí se corrige. El estado actual del sistema vive en
> `docs/arquitectura/` y `docs/referencia/`.

- **Fecha:** 2026-07-30
- **Revisión:** 2026-07-30 — refinamientos arquitectónicos: TTL del token y revocación
  por Redis (§3.1), z-order con índices fraccionarios (§4.1), recolección de cursores
  fantasma (§5.4), escenario obligatorio de undo colaborativo (§8.1) y accesibilidad del
  lienzo (§9, fase 3)
- **Estado:** aprobado, pendiente de plan de implementación
- **Objetivo del proyecto:** pieza de portfolio / demo técnica
- **Escaparate elegido:** producto full-stack pulido (no profundidad en sistemas distribuidos ni en rendering)
- **Horizonte:** iterativo por fases, sin fecha límite

## 1. Qué es

Una plataforma web de lienzo infinito colaborativo, estilo Figma/Miro, donde varios
usuarios dibujan y editan simultáneamente sobre el mismo documento sin conflictos de
estado y con latencia mínima. Sincronización mediante CRDT, cursores multijugador
interpolados y funcionamiento offline con sincronización posterior.

## 2. Decisiones de stack y por qué

Verificado contra el estado real del ecosistema el 2026-07-30. Cada elección desvía
del stack de partida (React + Fabric.js + Express + Socket.io + Yjs + Redis) solo
cuando hay un motivo concreto.

| Capa | Elección | Motivo de la decisión |
|---|---|---|
| CRDT | **Yjs** | Default de producción (~920K descargas/semana), ecosistema de providers y bindings sin rival. Loro es más rápido en benchmarks pero con ~12K descargas y ecosistema inmaduro. Automerge solo se justifica si el historial de versiones es feature de producto, y no lo es aquí. |
| Servidor de sync | **Hocuspocus 4** (estable) | Sustituye a Express + Socket.io escritos a mano. Aporta merge CRDT, awareness, persistencia, escalado horizontal con Redis pub/sub y sync offline. Coherente con el escaparate elegido: no reinventamos el transporte, invertimos en producto. |
| Canvas | **Konva + react-konva 19** | Descarta Fabric.js: su modelo de objetos mutable choca con el CRDT (dos fuentes de verdad del estado) y complica cualquier futura ruta a WebGL. Konva tiene la mejor integración con React y un scene graph por nodos que mapea limpiamente sobre el documento Yjs. |
| Canvas descartado | **tldraw: NO** | Licencia comercial 6.000 USD/año por equipo. La licencia hobby obliga a mostrar el watermark "made with tldraw" en el lienzo y prohíbe ocultarlo o interferir con la validación de licencia. En una demo de portfolio, el logo de otro producto sobre tu lienzo comunica lo contrario de lo que se busca. |
| API HTTP | **Hono** | Descarta Express: ~8-10K req/s y sin TypeScript nativo, frente a ~62K req/s de Hono. Fastify era la alternativa válida; se elige Hono por inferencia de tipos y ergonomía en greenfield. |
| Auth | **Better Auth** | Default self-hosted de 2026: passkeys, RBAC y multi-tenancy de serie, sin coste por usuario. **Lucia está deprecado y no recibe parches de seguridad — prohibido usarlo.** Clerk se descarta porque los usuarios vivirían en infraestructura ajena. |
| ORM | **Drizzle** | SQL-first, migraciones legibles en el repo, sin motor de queries binario en la imagen Docker. Elección por afinidad con el enfoque, no por benchmark. |
| Build frontend | **Vite 8** (Rolldown) | Estable desde marzo de 2026; Rolldown reemplaza esbuild y Rollup con builds 10-30x más rápidos, lo que importa dentro de un contenedor. |
| Runtime | **Node 24 LTS** ("Krypton") | LTS activo con soporte hasta abril de 2028. No usar Node 26: es Current, no LTS. |
| Datos | **Postgres 18.4** · **Redis 8.8.1** | Últimas estables. No usar Postgres 19: está en beta 2. |
| Contenedores | **OrbStack** + devcontainer completo | El host no tiene Node instalado y así se queda. |

## 3. Arquitectura

Monorepo con pnpm workspaces. Cinco contenedores en `compose.yaml`.

```
collab-canvas-crdt/
├─ .devcontainer/          # Node 24 LTS + pnpm, adjunto a la composición
├─ apps/
│  ├─ web/                 # Vite 8 + React 19 + react-konva 19
│  ├─ api/                 # Hono + Better Auth + Drizzle
│  └─ sync/                # Hocuspocus 4 + extension-redis + extension-database
├─ packages/
│  ├─ schema/              # esquema Drizzle + tipos compartidos
│  └─ canvas-core/         # documento Yjs, formas y operaciones (sin React ni Konva)
├─ docs/
└─ compose.yaml            # web · api · sync · postgres · redis
```

| Servicio | Responsabilidad | Puerto publicado |
|---|---|---|
| `web` | SPA del editor. En dev, Vite con HMR dentro del contenedor | sí |
| `api` | Sesiones, salas, membresías, permisos. Todo lo que no es tiempo real | sí |
| `sync` | WebSocket: merge CRDT, awareness, persistencia | sí (solo WS) |
| `postgres` | Metadatos + snapshots binarios del documento Yjs | no |
| `redis` | Pub/sub entre réplicas de `sync` + awareness cross-instancia | no |

Solo `web`, `api` y `sync` publican puertos. `postgres` y `redis` son alcanzables
únicamente por nombre de servicio dentro de la red de Docker.

### 3.1 Autenticación entre dos procesos

Al separar `api` y `sync`, el WebSocket no comparte sesión con el API. Contrato:

1. El cliente pide acceso a un board al `api`.
2. `api` verifica la membresía y emite un **JWT con TTL de 24 horas** que incluye
   `boardId` y `role`.
3. El cliente abre el WebSocket contra `sync` pasando ese token.
4. `sync` valida la firma en el hook `onAuthenticate` de Hocuspocus.

`sync` **no** tiene acceso a la tabla de sesiones: solo verifica una firma y lee las
claims. Esa es la frontera entre ambos servicios y el motivo por el que la separación
se sostiene sin acoplarlos por la base de datos.

**El TTL es largo a propósito.** Esto es una demo de portfolio: quien la evalúa deja la
pestaña abierta y vuelve un rato después, y un token de minutos convertiría eso en una
desconexión en cada visita. El precio de las 24 horas es que **la caducidad del token
deja de servir como mecanismo de revocación**, así que la revocación pasa a ser
explícita.

#### Revocación en caliente: dos mecanismos, no uno

| Mecanismo | Qué cubre | Cómo |
|---|---|---|
| Evento `revoke_user` en Redis | Conexiones **ya abiertas** | `api` publica `revoke_user: { userId, boardId }`. Todas las réplicas de `sync` están suscritas y cierran de inmediato el WebSocket de ese usuario en ese board |
| Marca `revoked:` en Redis | **Reconexiones** posteriores | `api` escribe `revoked:{userId}:{boardId}` con TTL igual al del JWT. `onAuthenticate` consulta esa clave y rechaza aunque la firma sea válida |

**El segundo mecanismo no es opcional.** El pub/sub solo alcanza a las conexiones vivas:
un usuario al que acabas de retirar el acceso pulsa F5, presenta el mismo JWT —válido
todavía durante horas— y `onAuthenticate` lo admite, porque el evento de revocación ya
pasó y nadie lo recuerda. Con TTL de 15 minutos ese agujero duraba un cuarto de hora; con
24 horas dura un día entero.

El TTL de la marca puede igualar el del token: pasado ese plazo el JWT caduca por sí
solo y la marca deja de hacer falta, así que Redis se limpia sin intervención.

`sync` ya mantiene una conexión a Redis por `extension-redis`; el canal de revocación es
propio y va **aparte** del que Hocuspocus usa para propagar updates, para no mezclar
mensajes de control con mensajes de documento.

### 3.2 Aislamiento de `canvas-core`

`packages/canvas-core` contiene la forma del documento Yjs y las operaciones
(`addShape`, `moveShape`, `deleteShapes`, `reorder`, …) **sin una línea de React ni de
Konva**. Konva es un adaptador de render; React, un adaptador de UI.

Consecuencia buscada: la convergencia CRDT se verifica en Node puro, con varios
`Y.Doc` en memoria, sin arrancar un navegador.

**Segunda consecuencia, igual de deliberada: Konva es reemplazable.** La decisión de §2
se mantiene —Konva es lo correcto para el escaparate elegido— pero `canvas-core` no
importa Konva ni conoce su existencia: expone estado y operaciones, y el renderer se
suscribe. Sustituirlo más adelante por un motor WebGL propio (PixiJS, o WebGL a pelo con
instancing) consiste en escribir un adaptador nuevo y borrar el viejo, **sin tocar una
línea de la convergencia del estado ni un solo test de CRDT**. Esa es la razón de fondo
de que el paquete exista: el eje de "rendimiento gráfico" queda abierto como fase futura
en lugar de quedar clausurado por la elección de librería de hoy.

## 4. Modelo de datos

### 4.1 Documento Yjs

```
doc
└─ shapes: Y.Map< shapeId → Y.Map<{
                       type, x, y, w, h, rotation, fill, stroke,
                       zIndex,      # string: índice fraccionario ("a0", "a0V", "a1")
                       content,     # Y.Text, solo en formas de tipo texto
                     }> >
```

**Cada forma es un `Y.Map` anidado, nunca un objeto JSON plano.** Con un objeto plano,
dos usuarios que a la vez cambien uno el color y otro la posición producirían un
last-write-wins que descarta uno de los dos cambios. Con `Y.Map` anidado la
granularidad de merge es por propiedad y ambos cambios sobreviven.

El texto de una forma de tipo texto es `Y.Text`, de modo que la edición de texto también
es colaborativa carácter a carácter.

Tipos de forma en el MVP: rectángulo, círculo, texto y flecha.

#### Z-order con índices fraccionarios, no con un array central

**No hay ninguna estructura de orden compartida.** El z-order es una propiedad `zIndex`
de tipo string dentro de cada forma, y el orden de pintado se obtiene ordenando las
formas por ese string.

El motivo es que un `Y.Array<shapeId>` centralizado es un punto único de contención:
mover una forma obliga a borrar e insertar en el array, y dos usuarios reordenando a la
vez producen intercalaciones (interleaving) y duplicados que convergen sin conflicto pero
hacia un orden que ninguno de los dos pidió. Con índice fraccionario, reordenar es
**escribir una propiedad de una sola forma**: se calcula una clave que caiga entre los
dos vecinos de destino (`generateKeyBetween`, de `fractional-indexing`) y se asigna. El
merge vuelve a ser por propiedad, igual que el resto del modelo, y dos personas
reordenando formas distintas no se pisan.

**Desempate obligatorio.** Dos clientes que insertan en el mismo hueco simultáneamente
pueden generar la **misma** clave fraccionaria. Yjs converge sin problema —cada `Y.Map`
conserva su valor— pero el orden de pintado quedaría indefinido y cada cliente podría
resolver el empate a su manera: **estado convergente, pantallas divergentes**, que es el
peor tipo de bug porque el CRDT parece estar funcionando. El comparador es por tanto
`(zIndex, shapeId)`, con el `shapeId` como segundo criterio determinista. Es una línea de
código, y sin ella el fallo aparece justo cuando dos personas usan la demo delante de
alguien.

El coste asumido es mantener la lista de pintado ordenada por `zIndex` en el cliente. Se
memoiza y solo se recalcula cuando cambia el conjunto de formas o algún `zIndex`, nunca
por frame.

### 4.2 Postgres

| Tabla | Contenido | Origen |
|---|---|---|
| `users`, `sessions`, `accounts`, `verification` | Identidad y sesiones | esquema generado por Better Auth |
| `boards` | `id`, `title`, `owner_id`, `created_at`, `updated_at` | propia |
| `board_members` | `board_id`, `user_id`, `role` ∈ {`owner`, `editor`, `viewer`} | propia |
| `board_docs` | `board_id` (PK), `ydoc` (`bytea`), `updated_at` | propia, escrita por `sync` |

`board_docs` guarda el snapshot binario del `Y.Doc`, persistido por `sync` a través de
`@hocuspocus/extension-database` (la clase de persistencia genérica) con **debounce de
2 s y `maxDebounce` de 10 s**, más un flush al quedarse la sala vacía. Sin el techo de
`maxDebounce`, una sesión de edición continua podría no persistir nunca.

**No usar `hocuspocus-extension-postgres`**: es un paquete de terceros sin releases
desde hace más de un año. Se implementa el driver propio sobre la extensión genérica.

## 5. Flujo de datos

> Esta sección describe el **estado final** del sistema, no la fase 1. En la fase 1 la
> sala es fija y sin autenticación: `sync` corre sin `onAuthenticate` y `y-indexeddb`
> todavía no está enganchado. Los pasos 2 y 4 de §5.1 llegan en la fase 2, y §5.5 en la
> fase 3.

### 5.1 Apertura de un board

1. El usuario navega a `/board/:id`.
2. `api` valida permiso y emite el JWT de sala.
3. `web` crea el `Y.Doc`, engancha `y-indexeddb` (carga instantánea desde local) y
   abre el `HocuspocusProvider` con el token.
4. `sync` valida el JWT, carga el snapshot desde Postgres y sincroniza.
5. Los cambios locales viajan al `sync`, que hace broadcast al resto de la sala y
   publica en Redis para las demás réplicas.

### 5.2 El gesto de arrastre — tres carriles

Escribir en Yjs en cada `mousemove` genera cientos de updates por segundo y por
usuario, infla el documento y satura la red. El diseño lo evita por arquitectura, no
por optimización posterior:

| Momento | Qué ocurre | Efecto |
|---|---|---|
| Durante el gesto | El nodo Konva se mueve **imperativamente**. Sin React, sin Yjs | 60fps |
| En paralelo, throttle ~40ms | Posición provisional por **awareness** (efímero, no persiste) | Los demás ven el movimiento en vivo |
| Al soltar | **Una sola transacción Yjs** con la posición final | Un update, no doscientos |

Esto es el requisito de "renderizado por lotes" del enunciado original.

### 5.3 Capas de Konva

Tres capas, para que un cursor remoto no fuerce el repintado del lienzo completo:

1. **Estática** — formas en reposo. Se redibuja solo cuando cambia el documento.
2. **Interacción** — la forma en arrastre y los handles de transformación.
3. **Overlay** — cursores y selecciones remotas.

### 5.4 Cursores remotos

`awareness` entrega posiciones a ~25Hz y la pantalla pinta a 60. Los cursores se
interpolan con lerp hacia la última posición conocida en **un único bucle
`requestAnimationFrame` compartido por todos los cursores**, no uno por cursor.

#### Recolección de cursores fantasma

Cuando un cliente cierra la pestaña envía su mensaje de salida y su estado de awareness
se limpia solo. El problema son las desconexiones **abruptas** —partición de red,
portátil cerrado, WiFi caído—: ese mensaje nunca llega, el socket queda semi-abierto, TCP
no avisa, y `sync` sigue creyendo que el cliente está ahí mientras su cursor se queda
clavado en la pantalla de todos los demás. En una demo, un cursor con el nombre de
alguien que se fue hace diez minutos es precisamente el detalle que delata que nadie
pensó en el caso.

Dos defensas, en capas distintas:

| Capa | Mecanismo | Umbral |
|---|---|---|
| `sync` | **Ping/pong a nivel WebSocket.** Si el cliente no responde al ping se termina la conexión; al terminarla, Hocuspocus purga su entrada de awareness y lo propaga a la sala y, vía Redis, a las demás réplicas | 30 s sin pong |
| `web` | **Filtro por antigüedad en el render.** El overlay descarta todo cursor cuyo último update supere el umbral, sin esperar a que el servidor lo confirme | 30 s sin update |

La defensa del cliente no es redundante: si la réplica que sostenía la conexión muerta se
cae, nadie emite la purga y el fantasma sobreviviría. El filtro local hace que la UI no
dependa de que el servidor acierte.

### 5.5 Offline

`y-indexeddb` como provider local. El board carga al instante desde IndexedDB, las
ediciones sin red se acumulan en el documento local y Yjs sincroniza el diff al
reconectar.

## 6. Autorización: la trampa a evitar

**El rol `viewer` no se implementa ocultando botones en la UI.** Cualquiera puede abrir
la consola del navegador y escribir directamente en el `Y.Doc`. `sync` debe rechazar en
el servidor los updates procedentes de una conexión con rol `viewer`. La autorización
vive en `sync`; la UI solo refleja el estado.

## 7. Manejo de errores

| Caso | Comportamiento requerido |
|---|---|
| Pérdida de conexión | Reintento con backoff. La UI muestra `conectado / reconectando / offline`. Yjs sigue aceptando ediciones locales. |
| JWT caducado a mitad de sesión | Con TTL de 24 h es infrecuente, pero sigue pasando en una pestaña abandonada un fin de semana. El provider pide un token nuevo al `api` **antes** de reconectar; si el `api` responde 403, la sesión pasa a modo lectura en lugar de reintentar en bucle. |
| Permiso revocado en caliente | `api` publica `revoke_user` en Redis y `sync` cierra el socket al instante (§3.1). El cliente pasa a modo lectura con aviso visible y **no** reintenta: la marca `revoked:` rechazaría la reconexión de todos modos. |
| Cursor fantasma por desconexión abrupta | Ping/pong con corte a los 30 s en `sync`, más filtro por antigüedad en el render del cliente (§5.4). |
| Postgres caído | `sync` continúa sirviendo la sala desde memoria y reintenta los snapshots. Un fallo de persistencia no tumba una sesión en curso. |
| Snapshot ilegible o corrupto | Fallar la carga con error explícito. **Nunca** arrancar un documento vacío: el usuario editaría encima y el board real se perdería. |

## 8. Estrategia de tests

Se sigue TDD: el test primero.

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitario | Vitest sobre Node puro | Operaciones de `canvas-core` e invariantes de las formas |
| Convergencia CRDT | Vitest, varios `Y.Doc` en memoria | Operaciones concurrentes sobre la misma forma; reordenamientos simultáneos, **incluido el empate de claves fraccionarias y su desempate por `shapeId`** (§4.1) |
| Integración | Cliente Hocuspocus real contra `sync` real | Rechazo del `viewer` en servidor; revocación en caliente por `revoke_user`; **rechazo de la reconexión con marca `revoked:` presentando un JWT aún válido**; recuperación de estado tras reconectar |
| E2E | Playwright, dos contextos de navegador | Dibujar en uno y verlo aparecer en el otro; cursores visibles; purga del cursor fantasma al matar un contexto sin cerrarlo limpiamente |
| **Partición de red** | Vitest o Playwright | Desconectar un cliente, editar en ambos, reconectar y verificar convergencia |
| **Undo colaborativo** | Vitest, dos `Y.Doc` con `UndoManager` | El escenario de §8.1, obligatorio |

El test de partición es el que verifica la promesa central del CRDT y es de
obligado cumplimiento antes de considerar la fase 1 terminada.

### 8.1 El escenario obligatorio de undo colaborativo

Es el caso que rompe las implementaciones ingenuas, y hay que fijarlo por test en vez de
descubrirlo delante de alguien:

1. **A** crea un rectángulo.
2. **B** le cambia el color.
3. **A** pulsa `Ctrl+Z`.

Con `trackedOrigins` acotado al origen local de A, el `UndoManager` de A solo rastrea las
operaciones de A, así que deshace **la creación**: el rectángulo desaparece y el cambio de
color de B se va con él. Es coherente —no puedes conservar el color de un objeto que ya no
existe— pero es una **decisión de producto que hay que tomar explícitamente**, porque la
alternativa (bloquear el undo de un objeto que otros han modificado) también es defendible
y da otro producto distinto.

Comportamiento que el test fija:

| Paso | Estado esperado |
|---|---|
| A deshace | El rectángulo se elimina en **ambos** clientes; el cambio de color de B desaparece con el objeto |
| A rehace | El rectángulo reaparece **con su color original**, no con el de B: el `UndoManager` de A restaura el estado que A creó, y la operación de B nunca estuvo en su pila |
| B pulsa `Ctrl+Z` antes que A | Se revierte **solo el color**; el rectángulo permanece. Cada pila es independiente |

El tercer caso es el que confirma que `trackedOrigins` está bien acotado: si el undo de B
borrara el rectángulo, el filtro de orígenes no está funcionando y el bug estaría oculto
tras un test que solo probara el caso 1.

## 9. Fases

Cada fase es entregable y demostrable por sí sola.

**Alcance del primer plan de implementación: fases 0 y 1.** Las fases 2, 3 y 4 tendrán
su propio plan cuando llegue su turno; intentar planificarlas ahora produciría un plan
que caduca antes de ejecutarse.

### Fase 0 — Andamio
Devcontainer, `compose.yaml` con los cinco servicios, pnpm workspaces, esquema Drizzle
con migraciones, healthchecks.
**Hecho cuando:** `docker compose up` levanta todo y `pnpm test` pasa dentro del contenedor.

### Fase 1 — MVP
`canvas-core` completo, formas primitivas (rectángulo, círculo, texto, flecha),
selección y movimiento, sala fija sin auth, cursores remotos interpolados.
**Hecho cuando:** dos navegadores editan sin conflicto, los cursores se mueven con
suavidad y el test de partición de red pasa.

### Fase 2 — Producto
Better Auth con email y passkey, dashboard de boards, membresías con roles,
JWT de sala hacia `sync`.
**Hecho cuando:** un `viewer` no puede escribir ni desde la consola del navegador.

### Fase 3 — Pulido
`y-indexeddb`, indicador de estado de conexión, undo/redo, export PNG/SVG, thumbnails
de board y accesibilidad básica del lienzo.
**Hecho cuando:** se puede editar sin red y el documento converge al volver, y un lector
de pantalla puede recorrer el contenido del lienzo.

Detalle obligatorio de esta fase: **el undo colaborativo**. Un `Ctrl+Z` ingenuo deshace el
último cambio del documento, que puede ser el de otro usuario. Se implementa con
`Y.UndoManager` y `trackedOrigins` para que solo revierta las operaciones propias, y su
comportamiento en concurrencia queda fijado por el test de §8.1.

#### Accesibilidad: árbol DOM espejo

Un `<canvas>` es un agujero negro para un lector de pantalla: un píxel no tiene
semántica. Esta fase incluye un **árbol DOM oculto paralelo** que se suscribe a
`canvas-core` y mantiene un elemento por forma con su tipo, su texto y su posición
descrita en palabras ("rectángulo, arriba a la izquierda").

Requisitos concretos:

- El contenedor se oculta **visualmente, no semánticamente**: técnica `sr-only`
  (`clip-path` sobre una caja de 1×1). **Nunca** `display: none` ni
  `visibility: hidden`, que lo esconderían también del lector de pantalla y dejarían la
  función sin efecto.
- El orden en el DOM sigue el **orden de lectura** (arriba-abajo, izquierda-derecha), no
  el `zIndex`: el z-order es una propiedad de pintado y no dice nada sobre en qué orden
  tiene sentido escuchar el contenido.
- Las formas de texto exponen su contenido real; las geométricas, una descripción
  generada.
- El `<canvas>` lleva `role="application"` y un `aria-label` con el resumen del board.

Alcance honesto: esto hace el lienzo **navegable y legible**, no editable por teclado. La
edición completa sin ratón es un proyecto en sí mismo y queda fuera (§10).

### Fase 4 — Operación y deploy
VPS propio con la misma composición, Caddy o Traefik para TLS, backups de Postgres,
**dos réplicas de `sync`** y un benchmark con cifras.
**Hecho cuando:** el escalado horizontal vía Redis pub/sub queda demostrado con dos
réplicas reales, no descrito en el README.

## 10. Fuera de alcance (YAGNI explícito)

- Comentarios y anotaciones sobre el lienzo
- Componentes / símbolos reutilizables
- Sistema de plugins
- Colaboración por voz o vídeo
- Aplicación móvil nativa
- Interfaz de time-travel del historial (Yjs conserva los updates, pero la UI de
  navegación histórica es otro proyecto)
- Edición completa del lienzo por teclado. La fase 3 cubre lectura accesible, no
  creación ni manipulación de formas sin ratón

## 11. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Reconciliación de React con muchos objetos durante el arrastre | Las interacciones calientes son imperativas sobre el nodo Konva; React solo reconcilia con cambios de documento confirmados (§5.2) |
| Crecimiento del documento Yjs con el uso prolongado | Snapshots con debounce y, si llegara a hacer falta, `Y.encodeStateAsUpdate` para compactar. No se optimiza antes de medir |
| Divergencia entre desarrollo y producción | La misma composición de OrbStack se despliega en el VPS; la configuración va por variables de entorno |
| `react-konva` acoplado a la versión de React | La paridad es estricta: `react-konva` 19.x exige React ≥ 19.2. Fijar ambas versiones y actualizarlas juntas |
| Árbol DOM espejo desincronizado del lienzo | Ambas representaciones se suscriben a `canvas-core`; ninguna deriva de la otra. Un espejo que leyera del scene graph de Konva divergiría en silencio en cuanto el renderer cambiara (§3.2) |
| Claves fraccionarias degeneradas tras muchos reordenamientos | Las claves crecen en longitud con reordenamientos repetidos en el mismo hueco. Es un problema de bytes, no de correctitud, y solo aparece con miles de operaciones sobre la misma posición. Si llegara a medirse, se renumera el board en una transacción. No se optimiza antes |
