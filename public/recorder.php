<?php

/**
 * Grapheus recorder window (a top-level window, because browsers block the
 * microphone inside OpenEMR's frames).
 *
 * @package   Grapheus
 * @copyright Copyright (c) 2026 Exetazo Health
 * @license   https://github.com/openemr/openemr/blob/master/LICENSE GNU General Public License 3
 */

require_once dirname(__FILE__, 5) . "/globals.php";

use OpenEMR\Common\Acl\AclMain;
use OpenEMR\Common\Csrf\CsrfUtils;

if (!AclMain::aclCheckCore('encounters', 'notes', '', 'write') && !AclMain::aclCheckCore('encounters', 'notes_a', '', 'write')) {
    echo xlt('Not authorized');
    exit;
}
$base = $GLOBALS['webroot'] . '/interface/modules/custom_modules/oe-module-grapheus/public';
$patient = !empty($_SESSION['pid']) ? getPatientData((int) $_SESSION['pid'], 'fname, lname') : [];
?>
<!doctype html>
<html>
<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo xlt('Grapheus recorder'); ?></title>
    <link rel="stylesheet" href="<?php echo attr($base); ?>/assets/grapheus.css?v=1">
</head>
<body class="g-rec">
<main id="rec" data-api="<?php echo attr($base . '/api.php'); ?>" data-csrf="<?php echo attr(CsrfUtils::collectCsrfToken('grapheus')); ?>"
      data-mode="<?php echo attr($_GET['mode'] ?? 'in_person'); ?>" data-ptype="<?php echo attr($_GET['ptype'] ?? 'established'); ?>" data-prep="<?php echo attr((string) (int) ($_GET['prep'] ?? 0)); ?>">
    <div class="g-rec-head"><b>Grapheus</b> <span><?php echo text(trim(($patient['fname'] ?? '') . ' ' . ($patient['lname'] ?? ''))); ?></span></div>
    <div class="g-rec-state"><span class="g-dot" id="dot"></span><span id="state"><?php echo xlt('Starting…'); ?></span></div>
    <div class="g-timer" id="timer">0:00</div>
    <div class="g-meter"><div id="level"></div></div>
    <div class="g-rec-buttons"><button id="pause" disabled><?php echo xlt('Pause'); ?></button><button id="stop" class="g-stop" disabled><?php echo xlt('Stop & draft'); ?></button></div>
    <p class="g-small" id="msg"><?php echo xlt('Keep this window open. It stops by itself after 5 silent minutes or 90 minutes.'); ?></p>
</main>
<script src="<?php echo attr($base); ?>/assets/grapheus-recorder.js?v=1"></script>
</body>
</html>
