<?php

namespace App\Providers;

use App\Application\Auth\ClaveDeIntentos;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use RuntimeException;

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
        $this->guardCorsOrigins();
        $this->configurarLimitesDeAutenticacion();
    }

    /**
     * Un CORS sin orígenes deja la API inservible para la SPA, y el síntoma que
     * llega al navegador es un error genérico que no dice qué falta configurar.
     * Aquí se convierte en un mensaje explícito.
     *
     * La comprobación se salta en consola a propósito: si abortara ahí, un
     * despliegue con la variable ausente no podría ejecutar ni las migraciones ni
     * config:clear, que es justo lo que hace falta para arreglarlo.
     */
    private function guardCorsOrigins(): void
    {
        if ($this->app->runningInConsole()) {
            return;
        }

        if (config('cors.allowed_origins') === []) {
            throw new RuntimeException(
                'No hay ningún origen permitido por CORS. Define CORS_ALLOWED_ORIGINS '
                .'en el .env como una lista de orígenes separados por comas, por '
                .'ejemplo http://app.evault.claude. El comodín * no se admite.'
            );
        }
    }

    /**
     * Límites de intentos sobre login y registro.
     *
     * El 429 que devuelven lleva Retry-After, que lo añade el propio middleware
     * de Laravel. Los umbrales y las claves están documentados en
     * config/throttling.php y en App\Application\Auth\ClaveDeIntentos.
     */
    private function configurarLimitesDeAutenticacion(): void
    {
        // Config::integer y no un cast: valida el tipo y falla si la
        // configuración trae algo que no es un entero, en vez de convertirlo en
        // silencio. Un THROTTLE_LOGIN_INTENTOS mal escrito daría (int) 0 con el
        // cast, es decir, ningún intento permitido y todos los logins en 429.
        RateLimiter::for('auth.login', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.login.minutos'),
            Config::integer('throttling.login.intentos'),
        )->by(ClaveDeIntentos::login($request)));

        RateLimiter::for('auth.registro', fn (Request $request): Limit => Limit::perMinutes(
            Config::integer('throttling.registro.minutos'),
            Config::integer('throttling.registro.intentos'),
        )->by(ClaveDeIntentos::registro($request)));
    }
}
