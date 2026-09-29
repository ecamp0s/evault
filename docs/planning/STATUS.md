# eVault — Estado del Backlog

> **Documento generado. No editar a mano.**
> Se regenera con `scripts/status.sh` leyendo GitHub, que es la única fuente
> de verdad del estado. Si algo aquí no refleja la realidad, corregirlo en
> GitHub y volver a generar. Las secciones delimitadas como manuales sí se
> editan a mano y el generador las preserva. Ver `docs/GUIDE.md`.

Generado: 2026-09-29
Fuente: [ecamp0s/evault](https://github.com/ecamp0s/evault/issues) y Project «eVault»
Issues: 354 en total, 352 cerrados, 2 abiertos

---

## 1) Objetivo de la iteración

<!-- manual:objetivo -->
**Iteración 20: sin planificar.** La 19 se cerró el 29 de septiembre de 2026 con su objetivo cumplido —nada se pierde sin querer y nada queda abierto sin saberlo— y su detalle está en [docs/planning/archive/ITERACION_19.md](archive/ITERACION_19.md).

**Los candidatos, para quien la planifique**, sin orden decidido:

- [#680](https://github.com/ecamp0s/evault/issues/680), **la extensión en Firefox.** Desbloqueado: el #716 midió que una extensión de Firefox 155 obtiene el mismo PRF con Windows Hello y abre la vault. Faltan las dos decisiones que pide un ADR: dónde se custodia la clave sin documentos *offscreen*, y cómo se instala si Firefox exige que Mozilla la firme.
- **La limpieza de la vault real**, que la 19 dejó como candidata: un modo de revisión que recorra desde la auditoría las entradas con algo que corregir, con el generador a mano y el progreso guardado, y **comprobar contraseñas filtradas** con el rango de k-anonimato de HIBP, que saca cinco caracteres de un SHA-1 hacia un tercero y por eso pide su propio ADR con `ADR-001` y `ADR-015` delante.
- **La vía A del #725**, si hace falta: revocar el token al cerrar la pestaña con `pagehide`. La B ya cubre la recarga, que era casi todo.
- [#624](https://github.com/ecamp0s/evault/issues/624), **reconciliar sin red**, en el backlog en `Low`.

**Y lo que no es de una iteración sino de quien tiene la vault:** 512 de 660 contraseñas con algo que corregir, 24 entradas sin confirmar, y decidir si olvida el historial de la vault real.
<!-- /manual:objetivo -->

## 2) Qué se puede tomar ahora

Issues abiertos sin ningún bloqueante abierto, ordenados por prioridad. El primero de la lista es lo siguiente a tomar.

1. [#680](https://github.com/ecamp0s/evault/issues/680) feat(extension): la extensión en Firefox (Medium)
1. [#624](https://github.com/ecamp0s/evault/issues/624) feat(web): reconciliar sin red (Low)

## 3) Backlog

Lo abierto y todo lo de las iteraciones que siguen abiertas.

| Issue | Título | Labels | Estado | Prioridad | Bloqueada por | Bloquea a |
| --- | --- | --- | --- | --- | --- | --- |
| [#624](https://github.com/ecamp0s/evault/issues/624) | feat(web): reconciliar sin red | `feat` `web` | Todo | Low | #619 | — |
| [#680](https://github.com/ecamp0s/evault/issues/680) | feat(extension): la extensión en Firefox | `feat` `extension` | Todo | Medium | #675, #716 | — |

Las iteraciones cerradas no se pintan aquí: sus issues están en GitHub y lo que se aprendió, en `docs/planning/archive/`. Cada issue cuenta en la última iteración que lo lleva, así que el enlace de una puede enseñar alguno más: los que empezaron en ella y se cerraron en otra.

| Iteración | Issues | Dónde verlos |
| --- | --- | --- |
| 19 | 19 | [label `s19`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As19) |
| 18 | 16 | [label `s18`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As18) |
| 17 | 24 | [label `s17`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As17) |
| 16 | 26 | [label `s16`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As16) |
| 15 | 26 | [label `s15`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As15) |
| 14 | 22 | [label `s14`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As14) |
| 13 | 23 | [label `s13`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As13) |
| 12 | 20 | [label `s12`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As12) |
| 11 | 13 | [label `s11`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As11) |
| 10 | 16 | [label `s10`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As10) |
| 9 | 16 | [label `s9`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As9) |
| 8 | 10 | [label `s8`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As8) |
| 7 | 19 | [label `s7`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As7) |
| 6 | 16 | [label `s6`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As6) |
| 5 | 12 | [label `s5`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As5) |
| 4 | 19 | [label `s4`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As4) |
| 3 | 14 | [label `s3`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As3) |
| 2 | 13 | [label `s2`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As2) |
| 1 | 19 | [label `s1`](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+label%3As1) |
| sin iteración | 11 | [sin label de iteración](https://github.com/ecamp0s/evault/issues?q=is%3Aissue+-label%3As19+-label%3As18+-label%3As17+-label%3As16+-label%3As15+-label%3As14+-label%3As13+-label%3As12+-label%3As11+-label%3As10+-label%3As9+-label%3As8+-label%3As7+-label%3As6+-label%3As5+-label%3As4+-label%3As3+-label%3As2+-label%3As1) |

## 4) Grafo de dependencias

```mermaid
graph LR
  I624["#624<br/>Todo"]
  I680["#680<br/>Todo"]
  classDef hecho fill:#1a7f37,stroke:#1a7f37,color:#fff;
```

La flecha va del bloqueante al bloqueado. En verde, lo ya cerrado.

## 5) Criterios de salida de la iteración

<!-- manual:salida -->
### Iteración 20, sin planificar

**Todavía no tiene criterios de salida.** Los de la 19, evaluados uno a uno, están en [docs/planning/archive/ITERACION_19.md](archive/ITERACION_19.md).
<!-- /manual:salida -->

## 6) Riesgos

<!-- manual:riesgos -->
| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Una pestaña abierta desde antes de un despliegue sigue con el código viejo** | `Abierto, heredado: es un paso de cada despliegue` | El service worker nuevo toma el control, pero una página ya cargada ejecuta su código hasta que se recarga, y la extensión no se actualiza sola al desplegar (`ADR-023` §5.3): hay que reconstruirla y recargarla en `chrome://extensions`. Que la extensión sea de solo lectura es lo que impide que eso cueste datos. |
| **El historial guarda contraseñas viejas, que son secretos** | `Mitigado desde el #646` | Se pueden olvidar todas de una vez, con un aviso aparte para las 24 entradas sin confirmar; hacerlo sobre la vault real lo decide quien la tiene. |
| **Un secreto borrado sigue treinta días en la papelera** | `Mitigado en el #707` | Borrar del todo desde la papelera lo quita al momento. Lo que no alcanza nada son las copias de seguridad, que lo conservan hasta que rotan. |
| **El límite de desbloqueos con passkey se comparte** | `Asumido en ADR-023 §5.5` | Cinco por hora y cuenta, entre la web, la extensión y todos los dispositivos. Si pasa, el popup dice que hay que esperar y no culpa a la red. |
| **La suite no ve lo que hace MySQL** | `Abierto, sin issue: es una propiedad de la suite` | Los tests corren en SQLite, que no tiene bloqueos de hueco, y el #730 encontró tres sitios del alta que en MySQL morían con dos peticiones a la vez. Lo que se hace a la vez se prueba también contra el MySQL de desarrollo. |
<!-- /manual:riesgos -->
