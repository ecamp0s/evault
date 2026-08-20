<?php

use Illuminate\Support\Facades\DB;

it('runs the tests on in-memory SQLite and never on MySQL', function () {
    $connection = DB::connection();

    expect($connection->getDriverName())->toBe('sqlite')
        ->and($connection->getDatabaseName())->toBe(':memory:');
});
