<?php

/**
 * One tap on a suggested test puts it where the clinician orders labs, so it is already there
 * when they open the order:
 *   - Archway (TebraToOpenEMR): a pending test for the patient that Archway's Create Order
 *     dialog loads as already picked.
 *   - Stock OpenEMR with lab ordering set up: a line on a pending (unsent) procedure order in
 *     the open encounter; later taps add to the same order.
 *   - No lab ordering set up, no encounter, or no orderable test by that name: nothing here;
 *     the caller falls back to a chart task.
 * Nothing is ever transmitted to a lab. The clinician reviews and sends the order themselves.
 *
 * @package   Grapheus
 * @copyright Copyright (c) 2026 Exetazo Health
 * @license   https://github.com/openemr/openemr/blob/master/LICENSE GNU General Public License 3
 */

declare(strict_types=1);

namespace Exetazo\Grapheus;

use OpenEMR\Common\Uuid\UuidRegistry;

final class Orders
{
    /** Short names clinicians say, and the catalog words they usually stand for. */
    private const ALIASES = [
        'tsh' => 'thyroid stimulating hormone', 'cbc' => 'complete blood count', 'bmp' => 'basic metabolic panel',
        'cmp' => 'comprehensive metabolic panel', 'a1c' => 'hemoglobin a1c', 'hba1c' => 'hemoglobin a1c', 'ua' => 'urinalysis',
        'lfts' => 'hepatic function panel', 'lft' => 'hepatic function panel', 'lipids' => 'lipid panel', 'ecg' => 'electrocardiogram',
        'ekg' => 'electrocardiogram', 'uacr' => 'albumin creatinine ratio', 'b12' => 'vitamin b12', 'psa' => 'prostate specific antigen',
        'inr' => 'prothrombin time', 'bnp' => 'natriuretic peptide', 'hcg' => 'pregnancy test', 'uds' => 'drug screen',
    ];

    public static function ensureTables(): void
    {
        Db::exec("CREATE TABLE IF NOT EXISTS `grapheus_pending_tests` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, `pid` BIGINT NOT NULL, "
            . "`test` VARCHAR(255) NOT NULL, `kind` TINYINT NOT NULL DEFAULT 0 COMMENT '0 lab, 1 imaging or study', `reason` VARCHAR(500) NOT NULL DEFAULT '', "
            . "`visit_id` VARCHAR(40) NOT NULL DEFAULT '', `added_by` BIGINT NOT NULL, `added_at` DATETIME NOT NULL, `order_id` BIGINT DEFAULT NULL, "
            . "KEY `grapheus_pending_pid` (`pid`, `order_id`)) ENGINE = InnoDB COMMENT = 'Grapheus: tests waiting to be put on a lab order'");
    }

    public static function isArchway(): bool
    {
        return Db::one("SHOW TABLES LIKE 'archway_lab_order'") !== null;
    }

    public static function looksLikeImaging(string $test): bool
    {
        return preg_match('/\b(x-?ray|radiograph|ct\b|mri\b|ultrasound|sonogra|echo|ecg|ekg|electrocardio|dexa|bone density|mammogra|sleep study|polysomno|eeg|pet\b|scan|holter|doppler)/i', $test) === 1;
    }

    private static function norm(string $s): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower((string) preg_replace('/\([^)]*\)/', ' ', $s))));
    }

    /**
     * The orderable test in this OpenEMR that best fits the name, or null.
     *
     * @return array<string, mixed>|null
     */
    public static function match(string $test): ?array
    {
        $want = self::norm($test);
        if ($want === '') {
            return null;
        }
        $names = [$want];
        foreach (self::ALIASES as $short => $long) {
            if (preg_match('/\b' . preg_quote($short, '/') . '\b/', $want) === 1) {
                $names[] = $long;
            }
            if (str_contains($want, $long)) {
                $names[] = $short;
            }
        }
        $best = null;
        $bestScore = 0;
        $rows = Db::all("SELECT pt.procedure_type_id, pt.procedure_code, pt.name, pt.lab_id FROM procedure_type pt "
            . "JOIN procedure_providers pp ON pp.ppid = pt.lab_id WHERE pt.procedure_type LIKE 'ord%' AND pt.activity = 1 AND pp.active = 1 LIMIT 5000");
        foreach ($rows as $r) {
            $name = self::norm(Val::str($r['name'] ?? ''));
            $code = strtolower(Val::str($r['procedure_code'] ?? ''));
            foreach ($names as $n) {
                $score = 0;
                if ($name === $n || ($code !== '' && $code === $n)) {
                    $score = 100;
                } elseif ($name !== '' && strlen($n) >= 3 && (preg_match('/\b' . preg_quote($n, '/') . '\b/', $name) === 1)) {
                    $score = 60 - min(30, (int) (strlen($name) - strlen($n)) / 2);
                } elseif (strlen($name) >= 4 && preg_match('/\b' . preg_quote($name, '/') . '\b/', $n) === 1) {
                    $score = 50;
                }
                if ($score > $bestScore) {
                    $bestScore = $score;
                    $best = $r;
                }
            }
        }
        return $best;
    }

    /**
     * @return array{how: string, order?: int, name?: string, already?: bool}
     */
    public static function add(int $pid, int $encounter, int $userId, int $authorized, string $test, string $reason, string $visitId): array
    {
        $test = trim($test);
        if ($pid <= 0 || $test === '') {
            return ['how' => 'none'];
        }
        if (self::isArchway()) {
            self::ensureTables();
            $have = Db::one("SELECT id FROM grapheus_pending_tests WHERE pid = ? AND order_id IS NULL AND LOWER(test) = LOWER(?)", [$pid, $test]);
            if ($have === null) {
                Db::insert("INSERT INTO grapheus_pending_tests (pid, test, kind, reason, visit_id, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                    [$pid, mb_substr($test, 0, 255), self::looksLikeImaging($test) ? 1 : 0, mb_substr($reason, 0, 500), mb_substr($visitId, 0, 40), $userId]);
            }
            return ['how' => 'archway', 'name' => $test, 'already' => $have !== null];
        }
        if ($encounter <= 0) {
            return ['how' => 'none'];
        }
        $type = self::match($test);
        if ($type === null) {
            return ['how' => 'none'];
        }
        $lab = Val::int($type['lab_id'] ?? 0);
        $code = Val::str($type['procedure_code'] ?? '');
        $name = Val::str($type['name'] ?? '');
        return Db::transaction(static function () use ($pid, $encounter, $userId, $authorized, $lab, $code, $name, $reason): array {
            // The newest order for this lab in this encounter that has not been sent.
            $order = Db::one("SELECT procedure_order_id FROM procedure_order WHERE patient_id = ? AND encounter_id = ? AND lab_id = ? AND order_status = 'pending' "
                . "AND activity = 1 AND date_transmitted IS NULL ORDER BY procedure_order_id DESC LIMIT 1", [$pid, $encounter, $lab]);
            if ($order === null) {
                $orderId = Db::insert("INSERT INTO procedure_order (uuid, provider_id, patient_id, encounter_id, date_ordered, order_priority, order_status, activity, lab_id, clinical_hx) "
                    . "VALUES (?, ?, ?, ?, NOW(), 'normal', 'pending', 1, ?, ?)",
                    [(new UuidRegistry(['table_name' => 'procedure_order']))->createUuid(), $userId, $pid, $encounter, $lab, 'Started from the visit by Grapheus. Review before sending.']);
                Compat::addForm($encounter, 'Laboratory order', $orderId, 'procedure_order', $pid, $authorized);
            } else {
                $orderId = Val::int($order['procedure_order_id'] ?? 0);
            }
            if (Db::one("SELECT procedure_order_seq FROM procedure_order_code WHERE procedure_order_id = ? AND procedure_code = ?", [$orderId, $code]) !== null) {
                return ['how' => 'order', 'order' => $orderId, 'name' => $name, 'already' => true];
            }
            $seq = Val::int((Db::one("SELECT COALESCE(MAX(procedure_order_seq), 0) + 1 AS n FROM procedure_order_code WHERE procedure_order_id = ?", [$orderId]) ?? [])['n'] ?? 1);
            Db::exec("INSERT INTO procedure_order_code (procedure_order_id, procedure_order_seq, procedure_code, procedure_name, procedure_source, diagnoses, procedure_order_title, procedure_type, reason_description) "
                . "VALUES (?, ?, ?, ?, '1', '', 'laboratory_test', 'laboratory_test', ?)", [$orderId, $seq, $code, $name, mb_substr($reason, 0, 500)]);
            return ['how' => 'order', 'order' => $orderId, 'name' => $name, 'already' => false];
        });
    }

    /**
     * Tests waiting for this patient (Archway's Create Order dialog loads them).
     *
     * @return list<array<string, mixed>>
     */
    public static function pending(int $pid): array
    {
        self::ensureTables();
        return Db::all("SELECT id, test, kind, reason FROM grapheus_pending_tests WHERE pid = ? AND order_id IS NULL ORDER BY id", [$pid]);
    }
}
