CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text,
	`url` text NOT NULL,
	`email_id` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`application_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_source_external_idx` ON `leads` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`,`last_seen_at`);