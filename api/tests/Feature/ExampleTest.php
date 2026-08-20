<?php

it('answers at the application root', function () {
    $this->get('/')->assertOk();
});
