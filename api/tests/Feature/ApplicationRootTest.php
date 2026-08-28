<?php

/*
 * What answers at the root of the API, which is not an application.
 *
 * IT USED TO BE `ExampleTest.php` AND ONLY ASSERTED A 200 (#344). That passed just as
 * well while the root served Laravel's stock welcome page — 225 lines with Tailwind
 * inlined and a call out to a font CDN — inside a directory that has no frontend by
 * ADR-002 and ADR-003. A test that cannot tell those two apart is why nobody noticed
 * for months.
 */

it('answers at the application root', function () {
    $this->get('/')->assertOk();
});

it('says what this is instead of looking like an application', function () {
    $response = $this->get('/');

    $response->assertSee('API', escape: false);
    $response->assertSee('SPA que se sirve aparte', escape: false);
});

/*
 * The root is served to whoever finds the API by hand, so it must not drag anything in
 * from outside: the stock page asked a font CDN for its typeface, which in a repository
 * about not trusting third parties with what it serves is the wrong first impression.
 */
it('brings nothing in from outside', function () {
    $body = $this->get('/')->getContent();

    expect($body)->not->toContain('fonts.bunny.net');
    expect($body)->not->toContain('@vite');
    expect($body)->not->toContain('cdn.');
});

/*
 * The scaffolding this replaced is gone, and this is what says so out loud: a package
 * manifest reappearing here means somebody ran `laravel new` over the top, or a stock
 * script came back.
 */
it('has no frontend scaffolding of its own', function () {
    expect(file_exists(base_path('package.json')))->toBeFalse();
    expect(file_exists(base_path('vite.config.js')))->toBeFalse();
    expect(is_dir(resource_path('js')))->toBeFalse();
    expect(is_dir(resource_path('css')))->toBeFalse();
});
