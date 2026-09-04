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
