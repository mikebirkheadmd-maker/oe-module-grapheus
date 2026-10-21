<?php

/**
 * Module Manager "Config" button: Grapheus has no global settings to change here;
 * each clinician connects their own account from the Grapheus tab in an encounter.
 *
 * @package   Grapheus
 * @copyright Copyright (c) 2026 Exetazo Health
 * @license   https://github.com/openemr/openemr/blob/master/LICENSE GNU General Public License 3
 */

declare(strict_types=1);

// Module Manager loads this file on its own in an iframe, so start OpenEMR first
// (login check, globals and the text()/xl()/attr() helpers).
require_once dirname(__FILE__, 4) . '/globals.php';

$module_config = 1;
// Shown before the module is enabled too, so load our classes ourselves.
if (!class_exists(\Exetazo\Grapheus\Compat::class)) {
    require_once __DIR__ . '/src/Val.php';
    require_once __DIR__ . '/src/Compat.php';
}
$logo = \Exetazo\Grapheus\Compat::moduleUrl() . '/assets/img/grapheus-logo.png';
echo '<p><img src="' . attr($logo) . '" alt="' . attr(xl('Grapheus by Exetazo')) . '" style="height:56px;width:auto"></p>';
echo '<p>' . text(xl('Open any encounter and choose the Grapheus tab to connect your Grapheus account and start recording.')) . '</p>';
echo '<p><a href="https://scribe.exetazohealth.com" target="_blank" rel="noopener">scribe.exetazohealth.com</a></p>';
