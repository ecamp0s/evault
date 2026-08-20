<?php

declare(strict_types=1);

/*
 * Attempt limits over the authentication endpoints.
 *
 * They live in a config file and not in env() read from the service provider because
 * env() only works before the configuration is cached: with config:cache, a call to
 * env() outside config/ returns null in production.
 *
 * The defaults are deliberately conservative. See ADR-005: every environment value
 * has a sensible default so that a fresh clone starts up.
 *
 * THE KEYS BELOW STAY AS THEY ARE, and it is not something the conversion to English
 * missed: they are configuration and not symbols, so renaming one breaks whatever
 * reads it. CLAUDE.md lists them among the exceptions.
 */

return [

    /*
     * Login. The count runs by combination of IP and email, so these attempts are per
     * account attacked and not per attacker. Five a minute leaves ample room for
     * whoever genuinely mistypes and ruins brute force.
     */
    'login' => [
        'attempts' => (int) env('THROTTLE_LOGIN_ATTEMPTS', 5),
        'minutes' => (int) env('THROTTLE_LOGIN_MINUTES', 1),
    ],

    /*
     * Registration. Here the count runs by IP only: were the email included, changing
     * it on every request would be enough never to reach the limit, which is exactly
     * what whoever creates accounts in bulk does.
     *
     * The window is an hour because signing up is something done once. The known risk
     * is an IP shared by many people, an office behind NAT; ten sign-ups an hour
     * leaves room for that.
     */
    'register' => [
        'attempts' => (int) env('THROTTLE_REGISTER_ATTEMPTS', 10),
        'minutes' => (int) env('THROTTLE_REGISTER_MINUTES', 60),
    ],

    /*
     * Changing the master password. It receives the current authentication hash, so
     * with no limit it would be a place to try passwords with a session already open.
     * Changing it is something done very occasionally, so five an hour get in nobody's
     * way.
     */
    'master_password' => [
        'attempts' => (int) env('THROTTLE_MASTER_PASSWORD_ATTEMPTS', 5),
        'minutes' => (int) env('THROTTLE_MASTER_PASSWORD_MINUTES', 60),
    ],

    /*
     * Changing the email address. See ADR-014.
     *
     * Same profile as the one above and for the same reason: it receives the current
     * authentication hash, so with no limit it would be a place to try passwords with
     * a session already open. And there is one more reason particular to this
     * endpoint: its answer to an already registered email is indistinguishable from
     * the answer to a wrong password, but with no limit the instance could be
     * enumerated by sheer attempts even though no single answer says anything.
     */
    'email' => [
        'attempts' => (int) env('THROTTLE_EMAIL_ATTEMPTS', 5),
        'minutes' => (int) env('THROTTLE_EMAIL_MINUTES', 60),
    ],

    /*
     * Recovery with the recovery key. Stricter than the login, and not out of
     * symmetry: the usage profile is different. Nobody recovers their account five
     * times a day, so three attempts an hour do not get in the way of whoever really
     * uses it and narrow the window a great deal for whoever is trying it.
     *
     * The count runs by IP and email, as the login does: by IP alone a shared NAT
     * would lock out innocents, and by email alone anybody could block somebody
     * else's recovery on the very day they need it.
     *
     * This block used to sit two entries above, orphaned from the keys it describes.
     * It also said these keys were in English unlike the ones above, which stopped
     * being true when #119 finished migrating them on 4 August 2026.
     */
    'recovery' => [
        'attempts' => (int) env('THROTTLE_RECOVERY_ATTEMPTS', 3),
        'minutes' => (int) env('THROTTLE_RECOVERY_MINUTES', 60),
    ],

];
