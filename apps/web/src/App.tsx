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
