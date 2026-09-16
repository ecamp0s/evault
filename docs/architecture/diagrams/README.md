# Diagramas de eVault

Aquí vive la **fuente** de los diagramas que no son Mermaid. Hoy hay uno:
`zero-knowledge.dataflow.json`, que produce `docs/assets/zero-knowledge.svg`, la imagen que
abre la sección «The security guarantee, concretely» del `README.md`.

## Qué dibuja, y qué no

**Solo lo que fijan `ADR-001` y `ADR-008`**: qué sale del dispositivo y qué no. Eso cambia
poco —son decisiones cerradas e inmutables—, y ese es justamente el criterio para que un
diagrama merezca la pena. **No dibuja la estructura del código**, que cambia cada semana:
un diagrama es una afirmación con autoridad que nadie vuelve a comprobar, y uno que
describe código en movimiento miente antes de que nadie lo note.

## Cómo se regeneró, y por qué hace falta saberlo

Lo generó [archify](https://github.com/tt-a1i/archify), una *skill* para agentes con
licencia MIT, **fijada al commit `64b1ba0c1ee40c3da4d1d11d03ed353cccffdf2e`** (16 de
septiembre de 2026). **No está copiada en este repositorio**, así que regenerar el diagrama
exige clonarla aparte:

    git clone https://github.com/tt-a1i/archify
    cd archify && git checkout 64b1ba0c1ee40c3da4d1d11d03ed353cccffdf2e
    cd archify
    ARCHIFY_UPDATE_CHECK_DISABLED=1 node bin/archify.mjs validate dataflow <este.json> --quality showcase
    ARCHIFY_UPDATE_CHECK_DISABLED=1 node bin/archify.mjs deliver  dataflow <este.json> salida.html --quality showcase

`ARCHIFY_UPDATE_CHECK_DISABLED=1` **no es opcional aquí**: su `SKILL.md` pide al agente
ejecutar un comprobador que consulta un manifiesto en un servidor externo, y esta máquina
no llama a nadie para dibujar una caja. Con esa variable el comprobador sale en el acto y
sin red; el resto del CLI no hace ninguna petición.

**Y el último paso es manual, que es lo que hay que tener presente antes de tocar esto**:
el CLI solo escribe un HTML autocontenido de unos 790 KB. El SVG que se publica sale de
abrir ese HTML en un navegador y pulsar *Export → SVG*. No hay forma de hacerlo desde la
línea de comandos, así que **nada comprueba que el SVG publicado corresponda al JSON de al
lado**: si cambias el JSON, el SVG no cambia solo, y el repositorio no se va a quejar.

## Lo que el SVG pierde respecto al HTML

Las tres tarjetas del pie —«What never crosses», «What the server gets», «What follows from
it»— **no viajan en el SVG**. Lo que dicen está en la prosa del `README.md`, que es donde
tiene que estar de todas formas: un lector que no abre imágenes tiene que poder leer el
argumento entero.

## Licencias de lo que va dentro

El SVG lleva incrustada la fuente JetBrains Mono, bajo la SIL Open Font License 1.1, **con
el texto de la licencia dentro del propio fichero**, que es lo que esa licencia pide para
distribuirla embebida. archify es MIT; lo que hay en este repositorio es su salida y la
fuente JSON escrita para eVault, no su código.
