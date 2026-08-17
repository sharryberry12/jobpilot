CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`role_title` text NOT NULL,
	`jd_text` text NOT NULL,
	`source_url` text,
	`location` text,
	`company_domains` text,
	`applied_at` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`fit_score` real,
	`fit_json` text,
	`resume_version_id` text,
	`ghosted` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`from_addr` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`received_at` text NOT NULL,
	`application_id` text,
	`event_type` text,
	`confidence` real,
	`decided_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `emails_app_idx` ON `emails` (`application_id`);--> statement-breakpoint
CREATE INDEX `emails_received_idx` ON `emails` (`received_at`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`resource_url` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`evidence_bullet` text,
	`completed_at` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_items_plan_idx` ON `plan_items` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text,
	`goal` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plans_app_idx` ON `plans` (`application_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`extracted_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `requirements_app_idx` ON `requirements` (`application_id`);--> statement-breakpoint
CREATE TABLE `resume_master` (
	`id` text PRIMARY KEY DEFAULT 'master' NOT NULL,
	`profile_json` text NOT NULL,
	`source_filename` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resume_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`tailored_json` text NOT NULL,
	`docx_path` text,
	`approved` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resume_versions_app_idx` ON `resume_versions` (`application_id`);--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`proposed_application_id` text,
	`proposed_event` text,
	`confidence` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`corrected_application_id` text,
	`corrected_event` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_queue_status_idx` ON `review_queue` (`status`);--> statement-breakpoint
CREATE TABLE `status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`source` text NOT NULL,
	`email_id` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `status_events_app_idx` ON `status_events` (`application_id`,`created_at`);