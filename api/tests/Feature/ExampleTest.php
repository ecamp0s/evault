<?php

it('responde a la raíz de la aplicación', function () {
    $this->get('/')->assertOk();
});
