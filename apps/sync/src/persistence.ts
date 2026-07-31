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
