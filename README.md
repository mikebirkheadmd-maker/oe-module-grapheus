# Grapheus for OpenEMR

**Grapheus by Exetazo** is an AI medical scribe built by a practicing physician. This module puts it inside OpenEMR: record the visit, then review a drafted SOAP note, problems, allergies, prescriptions and fee-sheet codes right in the encounter. Clinicians review and sign everything; nothing is sent or billed automatically.

- Website and sign-up: https://scribe.exetazohealth.com
- Support: support@exetazohealth.com
- Issues: https://github.com/mikebirkheadmd-maker/oe-module-grapheus/issues

## Which version do I need?

| Your OpenEMR | Module version | Git branch | Composer |
|---|---|---|---|
| **8.x** (tested on 8.4.1) | 2.x | `main` | `composer require exetazo/oe-module-grapheus:^2.0` |
| **7.0.x** (tested on 7.0.3) | 1.x | `openemr-7.0` | `composer require exetazo/oe-module-grapheus:^1.0` |

The two editions share features; they differ only where OpenEMR's internals changed between 7.0 and 8.x.

## What it does

**In every encounter: the "Grapheus" tab (clinicians)**
- **Connect** your Grapheus account in one click. The key is stored encrypted with OpenEMR's CryptoGen.
- **Start recording** opens a small recorder window (browsers block the microphone inside OpenEMR's frames). Pause any time; it stops on its own after 5 silent minutes or 90 minutes.
- See drafts from this encounter, the Grapheus Chrome extension or the phone (last 48 hours).
- **Review and add** what you approve:
  - SOAP note (editable before saving)
  - Problems with ICD-10 codes
  - Allergies
  - Prescriptions, entered with `request_intent` "proposal" and **never transmitted**
  - Fee-sheet lines with **billed = 0**, justified by the diagnoses, plus a time statement for time-based billing

**Main menu: "Grapheus" (everyone, by permission)**
- *Set it up like…* (administrators): practice and facility, globals, lists, fee schedule, visit types and forms. Every change is proposed, approved, logged and can be undone.
- *Show me how to…*: step-by-step OpenEMR directions.
- *Schedule Molly with Dr Bob at 2:30*: the patient is found in OpenEMR's own records and confirmed before anything is booked.
- Authority follows OpenEMR ACLs: administrators can do everything; clinicians and schedulers can do daily tasks and how-to; everyone else gets how-to. An option limits the Assistant to administrators.
- Security settings, passwords and integrations are always blocked.

## Install

### Option 1: Module Manager / Composer
From the OpenEMR root, as the web server user:
```
composer require exetazo/oe-module-grapheus:^2.0    # OpenEMR 8.x
composer require exetazo/oe-module-grapheus:^1.0    # OpenEMR 7.0.x
```
`openemr/oe-module-installer-plugin` places it in `interface/modules/custom_modules/oe-module-grapheus`. Then go to **Modules > Manage Modules**, press **Install**, then **Enable**.

### Option 2: Git
```
cd /var/www/localhost/htdocs/openemr/interface/modules/custom_modules
git clone https://github.com/mikebirkheadmd-maker/oe-module-grapheus.git                    # OpenEMR 8.x
# git clone -b openemr-7.0 https://github.com/mikebirkheadmd-maker/oe-module-grapheus.git  # OpenEMR 7.0.x
```
Then **Modules > Manage Modules** → Install → Enable, or from the command line as the web user:
`su -s /bin/sh apache -c "php oe-module-grapheus/install/autoinstall.php"`

### Option 3: New practice, OpenEMR with Grapheus built in
Download `distribution/docker-compose.yml`, change the passwords, and run `docker compose up -d`. It uses `ghcr.io/mikebirkheadmd-maker/openemr-with-grapheus`; Grapheus installs and enables itself on first start.

### Connect
Create an account at https://scribe.exetazohealth.com, then press **Connect** in any encounter's Grapheus tab.

## Subscription
The module is free and open source. Transcription, AI drafting and the Assistant run on the Grapheus service and need a Grapheus subscription. Assistant requests are billed to the practice's Grapheus account. Plans and pricing: https://scribe.exetazohealth.com

## Privacy and HIPAA
Grapheus runs on AWS, with AI drafting on Amazon Bedrock under an AWS Business Associate Agreement, so protected health information stays in a HIPAA-eligible environment. Audio is deleted after transcription, and drafts are encrypted and deleted after 48 hours. Practices sign a BAA with Exetazo Health when they sign up.

## Support
- Email: support@exetazohealth.com
- Bugs and feature requests: https://github.com/mikebirkheadmd-maker/oe-module-grapheus/issues
- Website: https://scribe.exetazohealth.com

## License
GPL-3.0-or-later (see LICENSE), the same license as OpenEMR. The Grapheus service the module connects to is a separate, paid product of Exetazo Health.
