<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Los tests de Feature se ejecutan sobre la TestCase de Laravel con la base
| de datos recreada en cada test. phpunit.xml fuerza SQLite in-memory, así
| que RefreshDatabase nunca toca el MySQL de desarrollo.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');
