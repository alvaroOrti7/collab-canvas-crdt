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

## Detección de desconexión en el cliente

`connection-status` refleja el evento `status` de `HocuspocusProvider`, que a su vez
depende de `messageReconnectTimeout` (30 s por defecto, sin configurar explícitamente en
`useCanvasDoc`): el proveedor solo declara la conexión caída cuando pasan más de 30 s sin
recibir ningún mensaje del servidor, y lo comprueba cada `messageReconnectTimeout / 10`. En
la práctica, medido con `context().setOffline(true)` en Playwright, el indicador tarda del
orden de 39 s en pasar a `disconnected` — muy por encima de lo que sugeriría un simple
cierre de socket.

Bajar ese plazo haría reaccionar antes al indicador, pero a costa de reconexiones espurias
en una sala sin actividad: pasar 30 s sin recibir un mensaje del servidor es normal ahí, no
un síntoma de caída. Ese compromiso (cuánto tardar en desconfiar de un socket silencioso
frente a cuántas reconexiones innecesarias tolerar) pertenece al indicador de conexión
pulido de la fase 3; en la fase 1 el indicador es correcto pero lento para `disconnected`,
y solo se verifica en E2E el estado `connected`.
