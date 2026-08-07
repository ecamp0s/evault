<?php

declare(strict_types=1);

/**
 * Extrae los identificadores DECLARADOS de ficheros PHP usando token_get_all(),
 * el lexer del propio PHP.
 *
 * Por qué el lexer y no expresiones regulares: el mismo motivo que en el
 * extractor de TypeScript. Un regex sobre `function X` no ve una promoción de
 * constructor ni una propiedad declarada, y el inventario del issue #160 se
 * quedó corto tres veces por medir con la herramienta equivocada.
 *
 * Por qué token_get_all() y no nikic/php-parser, que está en api/vendor: ese
 * paquete llega ahí como dependencia transitiva de Larastan, y una medición no
 * puede depender de que otra herramienta siga arrastrando lo que necesita.
 * token_get_all() viene con PHP.
 *
 * Lee la lista de ficheros de stdin, uno por línea, y escribe JSON en stdout.
 * Un fichero ilegible o con error de sintaxis termina el proceso con código
 * distinto de cero: no medir no puede parecerse a medir cero.
 */

/**
 * Devuelve los identificadores declarados de un fichero.
 *
 * @return list<array{name: string, line: int, dataKey: bool}>
 */
function extractDeclarations(string $file): array
{
    $code = @file_get_contents($file);
    if ($code === false) {
        fwrite(STDERR, "no se pudo leer {$file}\n");
        exit(1);
    }

    // token_get_all() avisa en vez de lanzar ante código inválido, así que se
    // convierte el aviso en excepción. Un fichero que no se entiende tiene que
    // romper la medición, no producir cero identificadores.
    set_error_handler(static function (int $severity, string $message) use ($file): never {
        fwrite(STDERR, "{$file}: no se pudo tokenizar ({$message})\n");
        exit(1);
    });
    $tokens = token_get_all($code, TOKEN_PARSE);
    restore_error_handler();

    $found = [];

    // Palabras clave tras las que el siguiente T_STRING es un nombre que declaramos.
    $declaresNext = [T_FUNCTION, T_CLASS, T_INTERFACE, T_TRAIT, T_ENUM, T_CONST];

    $pending = null;
    foreach ($tokens as $token) {
        if (is_array($token)) {
            [$id, $text, $line] = $token;

            if (in_array($id, $declaresNext, true)) {
                $pending = $id;
                continue;
            }

            // Toda variable es una declaración o un uso; a efectos de idioma da
            // igual, porque el nombre es el mismo en los dos sitios. $this y las
            // superglobales no las escribimos nosotros.
            if ($id === T_VARIABLE) {
                $name = ltrim($text, '$');
                if ($name !== 'this' && ! str_starts_with($name, '_')) {
                    $found[] = ['name' => $name, 'line' => $line, 'dataKey' => false];
                }
                continue;
            }

            if ($id === T_STRING && $pending !== null) {
                $found[] = ['name' => $text, 'line' => $line, 'dataKey' => false];
                $pending = null;
                continue;
            }

            // Los literales de cadena NO se miran, y es deliberado: no son
            // identificadores. Ahí viven las claves de config/throttling.php,
            // los nombres de ruta y los campos del blob, que son datos — la
            // categoría que CLAUDE.md documenta como «parece identificador y es
            // dato». Mirarlos obligaría a excluirlos uno a uno; no mirarlos los
            // deja fuera por construcción.
            if ($id !== T_WHITESPACE && $id !== T_COMMENT && $id !== T_DOC_COMMENT) {
                $pending = null;
            }

            continue;
        }

        $pending = null;
    }

    return $found;
}

$input = stream_get_contents(STDIN);
if ($input === false) {
    fwrite(STDERR, "no se pudo leer la lista de ficheros de stdin\n");
    exit(1);
}

$result = [];
foreach (array_filter(explode("\n", trim($input))) as $file) {
    $result[$file] = extractDeclarations($file);
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
