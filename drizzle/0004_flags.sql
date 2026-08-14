CREATE TYPE "public"."environment" AS ENUM('dev', 'staging', 'prod');--> statement-breakpoint
CREATE TYPE "public"."rollout_kind" AS ENUM('boolean', 'percentage');--> statement-breakpoint
CREATE TABLE "flag_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	"kind" "rollout_kind" DEFAULT 'boolean' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_states_unique" UNIQUE("flag_id","environment")
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "flag_states" ADD CONSTRAINT "flag_states_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;