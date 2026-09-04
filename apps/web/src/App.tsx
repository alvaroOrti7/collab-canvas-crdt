import { CanvasStage } from './canvas/CanvasStage.js'

function boardIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('board') ?? 'demo'
}

export function App() {
  return <CanvasStage boardId={boardIdFromUrl()} />
}
