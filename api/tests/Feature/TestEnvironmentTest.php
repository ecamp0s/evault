<?php

use Illuminate\Support\Facades\DB;

it('ejecuta los tests sobre SQLite in-memory y nunca sobre MySQL', function () {
    $connection = DB::connection();

    expect($connection->getDriverName())->toBe('sqlite')
        ->and($connection->getDatabaseName())->toBe(':memory:');
});
