CREATE TABLE `instance_bootstrap` (
	`id` integer PRIMARY KEY NOT NULL,
	`claim` text NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instance_bootstrap_claim_unique` ON `instance_bootstrap` (`claim`);