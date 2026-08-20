<?php

namespace App\Providers;

use App\Application\Auth\AttemptKey;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureAuthRateLimits();
    }

    /**
     * Attempt limits over login and registration.
     *
     * The 429 they return carries Retry-After, which Laravel's own middleware adds. The
     * thresholds and the keys are documented in config/throttling.php and in
     * App\Application\Auth\AttemptKey.
     */
    private function configureAuthRateLimits(): void
    {
        // Config::integer and not a cast: it validates the type and fails when the
        // configuration carries something that is not an integer, instead of converting
        // it silently. A misspelled THROTTLE_LOGIN_ATTEMPTS would give (int) 0 with the
        // cast — that is, no attempts allowed and every login in a 429.
        RateLimiter::for('auth.login', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.login.minutes'),
            Config::integer('throttling.login.attempts'),
        )->by(AttemptKey::login($request)));

        RateLimiter::for('auth.register', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.register.minutes'),
            Config::integer('throttling.register.attempts'),
        )->by(AttemptKey::register($request)));

        RateLimiter::for('auth.master-password', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.master_password.minutes'),
            Config::integer('throttling.master_password.attempts'),
        )->by(AttemptKey::masterPassword($request)));

        RateLimiter::for('auth.email', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.email.minutes'),
            Config::integer('throttling.email.attempts'),
        )->by(AttemptKey::email($request)));

        RateLimiter::for('auth.recovery', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.recovery.minutes'),
            Config::integer('throttling.recovery.attempts'),
        )->by(AttemptKey::recovery($request)));
    }
}
