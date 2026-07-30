CREATE TYPE "public"."board_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "board_docs" (
	"board_id" text PRIMARY KEY NOT NULL,
	"ydoc" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_members" (
	"board_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "board_role" NOT NULL,
	CONSTRAINT "board_members_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_docs" ADD CONSTRAINT "board_docs_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_members_user_idx" ON "board_members" USING btree ("user_id");