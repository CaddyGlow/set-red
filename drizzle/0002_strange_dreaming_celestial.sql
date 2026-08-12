CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_workspace_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `workspace_deletion_jobs` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`requested_by_type` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`workspace_slug` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`storage_drain_until` integer NOT NULL,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_deletion_jobs_state_drain_idx` ON `workspace_deletion_jobs` (`state`,`storage_drain_until`);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `workspace_ref` text;--> statement-breakpoint
UPDATE `audit_logs` SET `workspace_ref` = `workspace_id` WHERE `workspace_ref` IS NULL;--> statement-breakpoint
CREATE INDEX `audit_logs_workspace_ref_created_at_id_idx` ON `audit_logs` (`workspace_ref`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_id_idx` ON `audit_logs` (`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `invitation` ADD `delivery_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitation` ADD `delivery_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invitation` ADD `last_delivery_attempt_at` integer;--> statement-breakpoint
UPDATE `invitation` SET `status` = 'canceled'
WHERE `status` = 'pending'
  AND `id` NOT IN (
    SELECT min(`id`) FROM `invitation`
    WHERE `status` = 'pending'
    GROUP BY `organization_id`, lower(trim(`email`))
  );--> statement-breakpoint
UPDATE `invitation` SET `email` = lower(trim(`email`));--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_pending_organization_email_idx` ON `invitation` (`organization_id`,`email`) WHERE "invitation"."status" = 'pending';
