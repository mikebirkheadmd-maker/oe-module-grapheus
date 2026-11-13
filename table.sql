-- Grapheus by Exetazo. Run by OpenEMR's Module Manager on install.
#IfNotTable grapheus_keys
CREATE TABLE IF NOT EXISTS `grapheus_keys` (
  `user_id` BIGINT NOT NULL PRIMARY KEY COMMENT 'users.id',
  `key_enc` TEXT NOT NULL COMMENT 'Grapheus key, encrypted with OpenEMR CryptoGen',
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `connected_at` DATETIME NOT NULL
) ENGINE = InnoDB COMMENT = 'Grapheus: each clinician connects their own Grapheus account';
#EndIf

#IfNotTable grapheus_links
CREATE TABLE IF NOT EXISTS `grapheus_links` (
  `visit_id` VARCHAR(40) NOT NULL PRIMARY KEY COMMENT 'Grapheus visit id',
  `pid` BIGINT NOT NULL,
  `encounter` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL,
  `applied_at` DATETIME DEFAULT NULL,
  `applied_by` BIGINT DEFAULT NULL,
  `summary` TEXT,
  KEY `grapheus_links_enc` (`pid`, `encounter`)
) ENGINE = InnoDB COMMENT = 'Grapheus: which recording belongs to which encounter, and what was applied';
#EndIf

#IfNotTable grapheus_settings
CREATE TABLE IF NOT EXISTS `grapheus_settings` (
  `name` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` TEXT
) ENGINE = InnoDB COMMENT = 'Grapheus module settings';
INSERT IGNORE INTO `grapheus_settings` (`name`, `value`) VALUES ('server', 'https://scribe.exetazohealth.com');
#EndIf

#IfNotTable grapheus_setup_log
CREATE TABLE IF NOT EXISTS `grapheus_setup_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `at` DATETIME NOT NULL,
  `user_id` BIGINT NOT NULL,
  `op` VARCHAR(64) NOT NULL,
  `args` TEXT,
  `before_json` TEXT COMMENT 'values before the change, for undo',
  `undo_json` TEXT,
  `undone_at` DATETIME DEFAULT NULL
) ENGINE = InnoDB COMMENT = 'Grapheus Assistant: every approved change, and how to undo it';
#EndIf

#IfNotTable grapheus_pending_tests
CREATE TABLE IF NOT EXISTS `grapheus_pending_tests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `pid` BIGINT NOT NULL,
  `test` VARCHAR(255) NOT NULL,
  `kind` TINYINT NOT NULL DEFAULT 0 COMMENT '0 lab, 1 imaging or study',
  `reason` VARCHAR(500) NOT NULL DEFAULT '',
  `visit_id` VARCHAR(40) NOT NULL DEFAULT '',
  `added_by` BIGINT NOT NULL,
  `added_at` DATETIME NOT NULL,
  `order_id` BIGINT DEFAULT NULL,
  KEY `grapheus_pending_pid` (`pid`, `order_id`)
) ENGINE = InnoDB COMMENT = 'Grapheus: tests waiting to be put on a lab order';
#EndIf

#IfNotTable grapheus_quality_doc
CREATE TABLE IF NOT EXISTS `grapheus_quality_doc` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `pid` BIGINT NOT NULL,
  `measure` VARCHAR(40) NOT NULL,
  `done_on` DATE NOT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'met' COMMENT 'met, excluded',
  `details` TEXT,
  `note` TEXT,
  `encounter` BIGINT NOT NULL DEFAULT 0,
  `user_id` BIGINT NOT NULL,
  `saved_at` DATETIME NOT NULL,
  `voided` TINYINT NOT NULL DEFAULT 0,
  KEY `grapheus_quality_pid` (`pid`, `measure`)
) ENGINE = InnoDB COMMENT = 'Grapheus: quality measures documented as completed';
#EndIf
