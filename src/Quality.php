<?php

/**
 * Documenting that a quality measure was completed for a patient: what was done, when, the
 * result, or why it does not apply. Kept in the chart database and shown whenever the patient
 * is open (before, during or after a visit). The measure ids are Grapheus's own table.
 *
 * @package   Grapheus
 * @copyright Copyright (c) 2026 Exetazo Health
 * @license   https://github.com/openemr/openemr/blob/master/LICENSE GNU General Public License 3
 */

declare(strict_types=1);

namespace Exetazo\Grapheus;

final class Quality
{
    /** id => [name, reference, fields asked when documenting it (key => label)] */
    public const MEASURES = [
        'bp_control' => ['Blood pressure controlled (under 140/90) in hypertension', 'HEDIS CBP / CMS165', ['systolic' => 'Systolic', 'diastolic' => 'Diastolic']],
        'a1c_control' => ['Diabetes: A1c checked this year and under 8% (not over 9%)', 'HEDIS GSD / CMS122', ['value' => 'A1c %']],
        'eye_exam' => ['Diabetes: retinal eye exam', 'HEDIS EED / CMS131', ['result' => 'Result (retinopathy or none)', 'by' => 'Done by (eye professional or imaging)']],
        'kidney_eval' => ['Diabetes: kidney check (eGFR and urine albumin-creatinine ratio) this year', 'HEDIS KED', ['egfr' => 'eGFR', 'uacr' => 'Urine albumin-creatinine ratio']],
        'statin_diabetes' => ['Diabetes, ages 40 to 75: on a statin', 'HEDIS SPD', ['drug' => 'Statin and dose']],
        'statin_cvd' => ['Cardiovascular disease: on a moderate or high intensity statin', 'HEDIS SPC / CMS347', ['drug' => 'Statin and dose']],
        'colorectal' => ['Colorectal cancer screening up to date (45 to 75)', 'HEDIS COL / CMS130', ['test' => 'Test (colonoscopy, FIT, FIT-DNA, CT colonography)', 'result' => 'Result']],
        'breast' => ['Mammogram in the last 2 years (women 40 to 74)', 'HEDIS BCS / CMS125', ['result' => 'Result']],
        'cervical' => ['Cervical cancer screening up to date (women 21 to 64)', 'HEDIS CCS / CMS124', ['test' => 'Test (cytology, HPV, both)', 'result' => 'Result']],
        'depression_screen' => ['Depression screened with a standard tool, and a follow-up plan when positive', 'CMS2 / HEDIS DSF', ['tool' => 'Tool (PHQ-2, PHQ-9, other)', 'score' => 'Score', 'plan' => 'Follow-up plan when positive']],
        'depression_remission' => ['Depression: PHQ-9 repeated, remission or response at 4 to 8 months and 12 months', 'CMS159 / HEDIS DRR', ['score' => 'PHQ-9 score']],
        'antidepressant_adherence' => ['New antidepressant: stayed on it 12 weeks (acute) and 6 months (continuation)', 'HEDIS AMM', ['drug' => 'Antidepressant', 'status' => 'Still taking it (yes or no)']],
        'adhd_followup' => ['Child started on ADHD medication: visit within 30 days, then 2 more within 9 months', 'HEDIS ADD', ['visit' => 'Which follow-up visit this is']],
        'antipsychotic_metabolic' => ['On an antipsychotic: glucose or A1c and lipids checked this year', 'HEDIS APM / SSD / SMD', ['glucose' => 'Glucose or A1c', 'lipids' => 'LDL or lipid panel']],
        'hospital_followup' => ['After a mental health hospital stay or emergency visit: follow-up within 7 and 30 days', 'HEDIS FUH / FUM', ['discharged' => 'Discharge date']],
        'substance_followup' => ['New substance use diagnosis: treatment started within 14 days, 2 more contacts within 34 days', 'HEDIS IET', ['contact' => 'Which contact this is']],
        'tobacco' => ['Tobacco use asked, and cessation help given when positive', 'CMS138', ['status' => 'Tobacco use (never, former, current)', 'help' => 'Cessation help given']],
        'alcohol' => ['Unhealthy alcohol use screened and brief counseling given', 'CMS/MIPS 431', ['tool' => 'Tool (AUDIT-C, single question)', 'score' => 'Score', 'counseling' => 'Counseling given']],
        'bmi_followup' => ['BMI recorded, with a follow-up plan when outside the normal range', 'CMS69', ['bmi' => 'BMI', 'plan' => 'Follow-up plan']],
        'falls' => ['Age 65 and older: asked about falls', 'CMS139', ['falls' => 'Falls in the past year', 'plan' => 'Plan when at risk']],
        'med_reconciliation' => ['After a hospital discharge: medications reconciled within 30 days', 'HEDIS TRC / MRP', ['discharged' => 'Discharge date']],
        'osteoporosis_fracture' => ['Woman 67 to 85 after a fracture: bone density test or osteoporosis treatment within 6 months', 'HEDIS OMW', ['done' => 'Bone density test or treatment']],
        'immunization_adult' => ['Adult vaccines up to date (influenza, Td or Tdap, zoster, pneumococcal by age)', 'HEDIS AIS-E', ['vaccine' => 'Vaccine given or already on record']],
        'immunization_child' => ['Childhood and adolescent vaccines up to date', 'HEDIS CIS / IMA', ['vaccine' => 'Vaccine given or already on record']],
        'well_child' => ['Well-child visits on schedule', 'HEDIS W30 / WCV', ['visit' => 'Visit age']],
        'antibiotic_stewardship' => ['No antibiotic for a viral upper respiratory infection or acute bronchitis', 'HEDIS URI / AAB', ['diagnosis' => 'Diagnosis']],
        'back_imaging' => ['No imaging in the first 28 days of uncomplicated low back pain', 'HEDIS LBP', ['red_flags' => 'Red flags present (none, or which)']],
        'opioid_high_dose' => ['Opioids: not at high dose or from multiple prescribers; no benzodiazepine with it', 'HEDIS HDO / COB', ['dose' => 'Daily morphine milligram equivalents', 'pdmp' => 'Prescription monitoring program checked']],
        'advance_care_plan' => ['Age 65 and older: advance care plan discussed or on file', 'MIPS 047', ['status' => 'Discussed today, on file, or patient declined']],
        'social_needs' => ['Social needs screened (food, housing, transportation)', 'HEDIS SNS-E / MIPS 487', ['tool' => 'Tool', 'needs' => 'Needs found', 'plan' => 'Referral or plan']],
    ];

    public static function ensureTables(): void
    {
        Db::exec("CREATE TABLE IF NOT EXISTS `grapheus_quality_doc` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, `pid` BIGINT NOT NULL, `measure` VARCHAR(40) NOT NULL, "
            . "`done_on` DATE NOT NULL, `status` VARCHAR(12) NOT NULL DEFAULT 'met' COMMENT 'met, excluded', `details` TEXT, `note` TEXT, `encounter` BIGINT NOT NULL DEFAULT 0, "
            . "`user_id` BIGINT NOT NULL, `saved_at` DATETIME NOT NULL, `voided` TINYINT NOT NULL DEFAULT 0, KEY `grapheus_quality_pid` (`pid`, `measure`)) "
            . "ENGINE = InnoDB COMMENT = 'Grapheus: quality measures documented as completed'");
    }

    /**
     * Every measure with what is documented for this patient (newest first).
     *
     * @return list<array<string, mixed>>
     */
    public static function forPatient(int $pid): array
    {
        self::ensureTables();
        $docs = [];
        foreach (Db::all("SELECT q.id, q.measure, q.done_on, q.status, q.details, q.note, q.saved_at, u.fname, u.lname FROM grapheus_quality_doc q "
            . "LEFT JOIN users u ON u.id = q.user_id WHERE q.pid = ? AND q.voided = 0 ORDER BY q.done_on DESC, q.id DESC", [$pid]) as $r) {
            $docs[Val::str($r['measure'] ?? '')][] = ['id' => Val::int($r['id'] ?? 0), 'doneOn' => Val::str($r['done_on'] ?? ''), 'status' => Val::str($r['status'] ?? ''),
                'details' => Val::map(json_decode(Val::str($r['details'] ?? ''), true)), 'note' => Val::str($r['note'] ?? ''),
                'by' => trim(Val::str($r['fname'] ?? '') . ' ' . Val::str($r['lname'] ?? ''))];
        }
        $out = [];
        foreach (self::MEASURES as $id => [$name, $ref, $fields]) {
            $out[] = ['id' => $id, 'name' => $name, 'ref' => $ref, 'fields' => $fields, 'docs' => $docs[$id] ?? []];
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $in
     * @return array{ok: bool, error?: string, id?: int}
     */
    public static function save(int $pid, int $encounter, int $userId, array $in): array
    {
        $id = Val::str($in['measure'] ?? '');
        if ($pid <= 0 || !isset(self::MEASURES[$id])) {
            return ['ok' => false, 'error' => 'Pick a measure from the list.'];
        }
        $date = Val::str($in['doneOn'] ?? '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1 || strtotime($date) === false || strtotime($date) > time() + 86400) {
            return ['ok' => false, 'error' => 'Give the date it was done (not in the future).'];
        }
        $status = Val::str($in['status'] ?? '') === 'excluded' ? 'excluded' : 'met';
        $details = [];
        $raw = Val::map($in['details'] ?? null);
        foreach (array_keys(self::MEASURES[$id][2]) as $key) {
            $v = trim(mb_substr(Val::str($raw[$key] ?? ''), 0, 200));
            if ($v !== '') {
                $details[$key] = $v;
            }
        }
        $note = trim(mb_substr(Val::str($in['note'] ?? ''), 0, 1000));
        if ($status === 'excluded' && $note === '') {
            return ['ok' => false, 'error' => 'Say why it does not apply or was declined.'];
        }
        if ($status === 'met' && $details === [] && $note === '') {
            return ['ok' => false, 'error' => 'Enter the result, or a note on what was done.'];
        }
        self::ensureTables();
        $new = Db::insert("INSERT INTO grapheus_quality_doc (pid, measure, done_on, status, details, note, encounter, user_id, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
            [$pid, $id, $date, $status, json_encode($details), $note, $encounter, $userId]);
        return ['ok' => true, 'id' => $new];
    }

    /** Remove a documentation entry made in error (kept, marked void). */
    public static function void(int $pid, int $docId): void
    {
        self::ensureTables();
        Db::exec("UPDATE grapheus_quality_doc SET voided = 1 WHERE id = ? AND pid = ?", [$docId, $pid]);
    }
}
