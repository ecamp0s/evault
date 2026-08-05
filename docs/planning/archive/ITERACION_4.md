ITERACIÓN 4 — Historial y lecciones aprendidas

Archivo de la Iteración 4, cerrada el 5 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que el producto dejó de dar miedo: hasta aquí eVault cifraba bien pero no dejaba sacar nada, no se podía cambiar la contraseña maestra y perderla significaba perderlo todo. Casi todo lo de abajo toca el material que abre la vault, así que si algo se comporta de forma rara al rotar contraseñas, al recuperar acceso o al exportar, merece la pena buscar aquí antes de investigar desde cero.

El objetivo era que se pudiera sacar lo que hay dentro, entrar si se pierde la contraseña, y rotarla sin recifrar nada. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Diecinueve issues: los dieciocho planificados en el 114, del 110 al 130, más el 133, que salió por el camino. Se cerraron todos. Por el camino se abrió además el 149, con deuda nueva.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub.

Bloque cero, el repositorio público. El issue 110 puso descripción y topics, activó el escaneo de secretos con push protection, y creó el ruleset de master, con lo que cerró el 21. El 133 salió al revisar lo que ahora lee cualquiera: el proyecto nombraba explícitamente otro proyecto personal del mismo desarrollador, no público, que a un lector externo no le dice nada.

Bloque uno, la migración de identificadores a inglés, issues 115 a 119, uno por capa: lib/vault, lib, components, pages y la API. Cerró el 97, que era la deuda más antigua viva y venía de la Iteración 3.

Bloque dos, las decisiones antes del código. ADR-010 en el issue 120 para la clave de recuperación, ADR-011 en el 121 para el formato de export e import. Ninguno de los dos se escribió después de implementar, que es la única forma de que un ADR sirva para algo.

Bloque tres, sacar los datos. El export cifrado en el issue 122 y el import en el 123, con los dos formatos que decidió ADR-011.

Bloque cuatro, rotar la contraseña maestra. El servidor en el issue 124 y la pantalla en el 125.

Bloque cinco, la clave de recuperación. El envoltorio y el endpoint en el 126, generarla y entregarla en el 127, y usarla para recuperar el acceso en el 128.

Bloque seis, la copia de seguridad de la instancia, issue 129, con los comandos evault:backup y evault:restore.

El cierre es este documento, issue 130.


CRITERIOS DE SALIDA, Y CÓMO SE VERIFICÓ CADA UNO

Eran nueve y se cumplieron los nueve. Como en las tres iteraciones anteriores, ninguno se dio por bueno leyendo el código.

Uno, exportar la vault, vaciarla, importar y recuperar los mismos items. Se verificó el ciclo entero y no cada mitad por su lado, que es donde se esconden los formatos que solo se entienden a sí mismos.

Dos, el fichero de export cifrado no contiene ninguna de las cadenas escritas. Mismo método que el issue 59 en la iteración anterior: guardar un item con cadenas reconocibles y buscarlas en el fichero generado.

Tres, cambiar la contraseña maestra, salir, entrar con la nueva y ver intactos los items de antes. Verificado en el navegador con el ciclo completo: cambiar, RECARGAR para que la vault se bloquee de verdad, desbloquear con la nueva y encontrar las tres entradas descifrándose. En la base de datos, después, los items sin un solo updated_at movido.

Cuatro, un cambio de contraseña interrumpido a medias no deja a nadie fuera. Es el criterio que se verificó rompiendo el código a propósito, no leyendo la transacción: el test fuerza una excepción entre las dos escrituras y comprueba que el envoltorio se revirtió y que la contraseña sigue siendo la vieja. Está en api/tests/Unit/Auth/RotateMasterPasswordTest.php, señalado en el propio fichero como el test que importa.

Cinco, perder la contraseña maestra y recuperar el acceso con la clave de recuperación, terminando con una contraseña nueva utilizable. Verificado en el navegador de principio a fin, incluida la parte que no es opcional: recuperar no termina hasta fijar una contraseña maestra nueva.

Seis, un backup restaurado en una instancia limpia sirve una vault que abre con la contraseña de siempre. Verificado contra una base de datos vaciada, que es la única forma de saber si un backup es una copia de seguridad o solo un fichero.

Siete, ningún identificador en español en web/src ni en api/app, con los campos del contrato y las claves de configuración intactos.

Ocho, master protegido por ruleset y el bot regenerando STATUS.md sin romperse. Verificado en los dos sentidos y no leyendo la configuración: con la regla de pull request activa el workflow murió con GH013 y el push fue rechazado; sin ella, la regeneración volvió a pasar.

Nueve, Pest, Vitest, Larastan en nivel max y CI en verde: 230 tests en la API y 367 en la web, sin baseline.


LO QUE YA NO ES VERDAD, Y CONVIENE SABER QUE CAMBIÓ

Olvidar la contraseña maestra ya no es necesariamente perderlo todo. Era el único agujero duro del modelo y ADR-001 dejó prometida su mitigación desde la Iteración 1. La clave de recuperación la cumple sin tocar el principio: es un segundo secreto, generado en el cliente, que envuelve la MISMA clave de vault, así que el servidor sigue sin guardar nada que pueda abrir.

Con ella entra también un riesgo nuevo, y conviene decirlo en vez de celebrar solo la mitad: es la primera vez que el proyecto amplía a propósito su superficie de ataque. Hasta aquí solo la contraseña maestra abría la vault; ahora hay dos caminos completos, y el segundo no tiene segundo factor.

Rotar la contraseña maestra NO invalida la clave de recuperación, y esto es lo que más se malinterpreta de toda la iteración. La clave de vault no cambia al rotar —de eso trata ADR-008—, así que el envoltorio de recuperación sigue abriendo. Quien cambie la contraseña sospechando un robo y crea que con eso ha cortado todos los accesos, se equivoca. Por eso la pantalla del issue 125 lo dice en un aviso destacado y hay un test que falla si ese aviso desaparece.

Los identificadores del código ya no están en dos idiomas. La deuda del issue 97 venía de la Iteración 3 y era la más antigua viva.

El repositorio ya no nombra otro proyecto personal. La tensión con la inmutabilidad de los ADR se resolvió con un criterio que conviene recordar: lo inmutable es la DECISIÓN, no su redacción. Quitar un nombre propio que no aporta nada a un lector externo no cambia ninguna decisión, así que se editaron también los ADR y el archivo histórico.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

El texto de la interfaz se rompe CRUZANDO SALTOS DE LÍNEA, y ninguna auditoría línea a línea lo ve. Es la lección cara de esta iteración. Al cerrar el 119 aparecieron tres frases rotas en master —«antes de logOut de él», «Al close o recargar», «Tus data siguen aquí»— que llevaban ahí desde el 116 y el 118. Habían pasado por revisión, por la suite entera y por dos auditorías propias. Las encontró abrir el navegador. La comprobación que sirve compara todo el texto visible antes y después con las expresiones regulares en modo DOTALL, y no lee el diff.

Un renombrado global es más peligroso que el código que renombra. El primer intento del 115 tradujo también textos de interfaz —«Tienes cambios sin guardar» se convirtió en «sin save»— y los literales de los regex de los tests. Se descartó entero con git reset --hard y se rehízo acotado, protegiendo comentarios, cadenas, texto JSX y sus fragmentos partidos por interpolaciones.

Hay cosas que parecen identificadores y son datos. Renombrarlas rompe algo que ningún compilador vigila: los campos del blob, que se serializan y se cifran tal cual y por tanto son lo que hay escrito dentro de cada item ya guardado; el nombre del store de localStorage y su clave persistida; y la clave que los guards escriben en el state de react-router, que no está tipada. Están enumeradas en CLAUDE.md con su porqué.

El nombre en inglés puede colisionar con la librería que ya está en el fichero. registrar tradujo a register, que es lo que devuelve useForm de react-hook-form; y pintar tradujo a render, que es lo de Testing Library. Ninguna de las dos colisiones la habría detectado un diccionario.

npx tsc --noEmit no comprueba nada en este repositorio. El tsconfig.json de web tiene files vacío y project references, así que devuelve cero sin mirar un solo fichero. La comprobación real de tipos es npm run build. Se descubrió confiando en un cero que no significaba nada.

El middleware ability de Sanctum NO sirve para restringir. Es el hallazgo de seguridad de la iteración, encontrado en el 128 y anotado aquí porque es fácil de repetir: un token de sesión normal lleva la capacidad *, y * satisface cualquier comprobación de ability. Con abilities:recovery:complete, CUALQUIER sesión válida habría podido fijar una contraseña maestra nueva sin conocer la actual, que es exactamente el ataque que ese endpoint tenía que impedir. Lo cubre EnsureRecoveryToken, que compara la lista exacta de capacidades, y un test que comprueba que una sesión normal no entra.

Comprobar la propia suposición antes de escribirla en un ADR. Al implementar el carácter de comprobación del 127 di por hecho que no detectaría dos caracteres intercambiados. El test demostró que SÍ los detecta, porque la suma va sobre los bytes y cada carácter aporta cinco bits repartidos entre ellos. Si no llego a comprobarlo, habría quedado escrita una limitación falsa en la documentación de un mecanismo de seguridad.

Un test que depende del azar falla un día de cada treinta y dos. El test que alteraba un carácter de la clave de recuperación lo elegía a ojo, y una de cada treinta y dos veces lo cambiaba por sí mismo. Ahora la alteración se busca comprobando que de verdad altera algo.

Verificar en un navegador automatizado tiene un límite, y hay que decirlo en vez de disimularlo. La descarga del fichero de export no se pudo comprobar en disco; lo que se verificó fue el contenido real generado, interceptando URL.createObjectURL. Es menos que abrir el fichero, y quedó dicho así.

Comparar por identidad y no por texto cuando el texto es del usuario. El marcador de item ilegible se compara por identidad a propósito: comparando el texto, un item que alguien hubiera llamado «No se puede leer esta entrada» quedaría fuera de su propia copia de seguridad sin que nadie se enterara.

Y una de infraestructura que cuesta una tarde si no se sabe: GitHub no admite dar bypass a GitHub Actions en un repositorio personal, solo en organizaciones. Por eso el ruleset de master no exige pull request: la regla mata el push con el que el workflow status regenera STATUS.md, comprobado activándola.


DEUDA QUE DEJA

El issue 149, los tokens de sesión se acumulan y no caducan nunca. Salió al verificar el 125: recargar bloquea la vault y desbloquear hace por debajo un login completo, así que cada recarga deja un token vivo que nadie revoca. No rompe nada hoy con un solo usuario, pero la tabla crece sin techo y un token robado vale para siempre.

Siguen abiertos de antes el 45, el bundle en un solo chunk, y el 62, las comprobaciones de documentación en los PR.

La deuda del portapapeles que la tabla de riesgos arrastraba SIN issue dejó de existir sin que nadie la tocara, y merece la pena entender por qué: la interfaz solo promete el vaciado cuando puede cumplirlo, y lo decide en tiempo de ejecución mirando isSecureContext, no el entorno. Al mover el entorno local a .localhost en el issue 112 pasó a haber contexto seguro, y la promesa volvió sola. Es lo que se gana no cableando una condición de entorno en el código.
