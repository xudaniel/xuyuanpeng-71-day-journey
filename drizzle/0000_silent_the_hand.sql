CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text NOT NULL,
	`action` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_stage_revision` ON `revisions` (`stage`,`revision`);