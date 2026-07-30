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
