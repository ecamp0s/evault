<?php

namespace App\Providers;

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
}
