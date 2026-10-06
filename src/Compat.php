<?php

/**
 * One module for OpenEMR 7.0.x and 8.x. OpenEMR 8 moved session data behind
 * SessionWrapperFactory, CSRF tokens now take the session, globals live in
 * OEGlobalsBag and addForm() moved to FormService; 7.0.x uses $_SESSION,
 * $GLOBALS and the legacy functions. Everything version-specific is here.
 *
 * @package   Grapheus
 * @copyright Copyright (c) 2026 Exetazo Health
 * @license   https://github.com/openemr/openemr/blob/master/LICENSE GNU General Public License 3
 */

declare(strict_types=1);

namespace Exetazo\Grapheus;

use OpenEMR\Common\Csrf\CsrfUtils;
use OpenEMR\Common\Session\SessionWrapperFactory;
use OpenEMR\Core\OEGlobalsBag;
use OpenEMR\Services\FormService;
use Symfony\Component\HttpFoundation\Request;

final class Compat
{
    public const CSRF_SUBJECT = 'grapheus';

    private static ?Request $request = null;

    public static function request(): Request
    {
        return self::$request ??= Request::createFromGlobals();
    }

    /** The OpenEMR 8 session, or null on 7.0.x. */
    public static function session(): ?object
    {
        return class_exists(SessionWrapperFactory::class) ? SessionWrapperFactory::getInstance()->getActiveSession() : null;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $s = self::session();
        if ($s !== null && method_exists($s, 'get')) {
            return $s->get($key, $default);
        }
        return $_SESSION[$key] ?? $default;
    }

    public static function csrfToken(): string
    {
        $s = self::session();
        return $s !== null ? CsrfUtils::collectCsrfToken($s, self::CSRF_SUBJECT) : CsrfUtils::collectCsrfToken(self::CSRF_SUBJECT);
    }

    public static function csrfValid(string $token): bool
    {
        $s = self::session();
        return $s !== null ? CsrfUtils::verifyCsrfToken($token, $s, self::CSRF_SUBJECT) : CsrfUtils::verifyCsrfToken($token, self::CSRF_SUBJECT);
    }

    /** Let other OpenEMR requests run while a long upload is in progress. */
    public static function releaseSession(): void
    {
        $s = self::session();
        if ($s !== null && method_exists($s, 'save')) {
            $s->save();
        } elseif (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
    }

    public static function webroot(): string
    {
        if (class_exists(OEGlobalsBag::class)) {
            return OEGlobalsBag::getInstance()->getWebRoot();
        }
        return Val::str($GLOBALS['webroot'] ?? '');
    }

    public static function fileroot(): string
    {
        if (class_exists(OEGlobalsBag::class)) {
            return OEGlobalsBag::getInstance()->getProjectDir();
        }
        return Val::str($GLOBALS['fileroot'] ?? dirname(__DIR__, 5));
    }

    public static function moduleUrl(string $path = ''): string
    {
        return self::webroot() . '/interface/modules/custom_modules/oe-module-grapheus/public' . ($path === '' ? '' : '/' . ltrim($path, '/'));
    }

    /** Attach a form row to an encounter (FormService on 8.x, the legacy function on 7.0.x). */
    public static function addForm(int $encounter, string $name, int $formId, string $dir, int $pid, int $authorized): void
    {
        if (method_exists(FormService::class, 'addForm')) {
            (new FormService())->addForm($encounter, $name, $formId, $dir, $pid, (string) $authorized);
            return;
        }
        require_once self::fileroot() . '/library/forms.inc.php';
        \call_user_func('addForm', $encounter, $name, $formId, $dir, $pid, (string) $authorized);
    }
}
