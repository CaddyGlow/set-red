CREATE TRIGGER `workspace_settings_block_deleting_update`
BEFORE UPDATE ON `workspace_settings`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = OLD.`workspace_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `organization_block_deleting_update`
BEFORE UPDATE ON `organization`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `member_block_deleting_insert`
BEFORE INSERT ON `member`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`organization_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `member_block_deleting_update`
BEFORE UPDATE ON `member`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` IN (OLD.`organization_id`, NEW.`organization_id`))
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `invitation_block_deleting_insert`
BEFORE INSERT ON `invitation`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`organization_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `invitation_block_deleting_update`
BEFORE UPDATE ON `invitation`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` IN (OLD.`organization_id`, NEW.`organization_id`))
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `apikey_block_deleting_insert`
BEFORE INSERT ON `apikey`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`reference_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `apikey_block_deleting_update`
BEFORE UPDATE ON `apikey`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` IN (OLD.`reference_id`, NEW.`reference_id`))
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `domain_block_deleting_insert`
BEFORE INSERT ON `domains`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`workspace_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `domain_block_deleting_update`
BEFORE UPDATE ON `domains`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` IN (OLD.`workspace_id`, NEW.`workspace_id`))
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `link_block_deleting_insert`
BEFORE INSERT ON `links`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`workspace_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `link_block_deleting_update`
BEFORE UPDATE ON `links`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` IN (OLD.`workspace_id`, NEW.`workspace_id`))
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `tag_block_deleting_insert`
BEFORE INSERT ON `tags`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`workspace_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;--> statement-breakpoint
CREATE TRIGGER `link_tag_block_deleting_insert`
BEFORE INSERT ON `link_tags`
WHEN EXISTS (SELECT 1 FROM `workspace_deletion_jobs` WHERE `workspace_id` = NEW.`workspace_id`)
BEGIN
  SELECT RAISE(ABORT, 'workspace deletion is in progress');
END;
