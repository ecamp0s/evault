ITERACIÓN 5 — Historial y lecciones aprendidas

Archivo de la Iteración 5, cerrada el 7 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que eVault dejó de ser un proyecto que solo corría en la máquina de su autor: ahora se levanta con un comando, se despliega con una guía verificada, y tiene una portada que enseñar. Si algo falla al desplegar, al levantar el Compose o al importar el fichero de ejemplo, merece la pena buscar aquí antes de investigar desde cero.

El objetivo era que eVault se levantara desde un clon con un comando, se desplegara con una guía verificada, y que quien lo abriera viera una vault con contenido en menos de un minuto. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Once issues cerrados: los ocho planificados que se completaron, más tres que salieron por el camino y que son buena parte del valor de la iteración.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub.

Bloque cero, rectificar. El issue 153 corrigió el criterio de salida siete de la Iteración 4, que afirmaba que no quedaban identificadores en español y era falso. Fue lo primero y fue solo, porque era lo único que estaba mintiendo en un repositorio público.

Bloque uno, la decisión antes del código. ADR-012 en el issue 154 fijó la estrategia de despliegue: Docker Compose con Caddy, PHP-FPM y MySQL, en red local y con la CA interna de Caddy.

Bloque dos, levantar con un comando. El issue 155 trajo el compose.yaml, y el 156 movió shadcn a devDependencies.

Bloque tres, algo que enseñar. El fichero .evault de ejemplo en el 157 y el screenshot del README en el 158.

Bloque cuatro, desplegar de verdad. El issue 159, con docs/operations/DEPLOYMENT.md y el servicio de alias mDNS.

Bloque cinco, la deuda. El issue 149 puso caducidad a los tokens de sesión, y con él se saldó la única deuda que dejó la Iteración 4.

Fuera de plan, y salieron de intentar el renombrado del issue 160: el 184, un byte NUL que hacía invisible un fichero para grep, y el 186, dos tests que dependían del orden de resolución.

Lo que NO se hizo y pasa a la Iteración 6: el renombrado de identificadores, que se partió en seis capas (issues 178 a 183) bajo el paraguas del 160; y el issue 62, las comprobaciones de documentación en los PR.


CRITERIOS DE SALIDA, Y CÓMO SE VERIFICÓ CADA UNO

Eran siete. Se cumplieron seis, y el quinto no. Se dice aquí y se dice en STATUS.md, porque esta iteración empezó rectificando un criterio mal dado por cumplido y sería absurdo cerrarla cometiendo el mismo error.

Uno, un clon limpio levanta con docker compose up y permite registrarse. Verificado clonando desde GitHub en un directorio nuevo y vacío del servidor, no desde el directorio de trabajo, que es donde ya existen .env, vendor y node_modules. Un Compose que solo funciona sobre un árbol ya inicializado no es reproducible: es el directorio del autor con un compose.yaml encima.

Dos, el fichero de ejemplo se importa y los items aparecen descifrados. Verificado en navegador y desde una cuenta DISTINTA de la que lo generó, que es la prueba de que el fichero no está atado a quien lo creó.

Tres, el screenshot del README es de la aplicación real. Lo es, y con los datos del fichero de ejemplo, de modo que cualquiera puede reproducir la misma pantalla. Un screenshot que nadie puede reproducir envejece sin que se note.

Cuatro, la guía de despliegue se verificó ejecutándola. Se ejecutó entera en el servidor: alias mDNS, certificados de la CA interna, registro en navegador real, y destrucción y recreación de los contenedores comprobando que datos y certificado sobreviven.

Cinco, cero identificadores en español en el código de producción, comprobado por un comando que queda en el repositorio. NO CUMPLIDO. Y rectificado el 7 de agosto de 2026, al planificar la Iteración 6, porque esta línea decía además que el comando existía y funcionaba: NO EXISTÍA. No estaba en el repositorio ni en ninguna parte, y las tres cifras que se dieron por buenas —ciento uno en el comentario del issue 160, ciento tres aquí y ciento cinco sumando la tabla de reparto por capas— no coincidían entre sí. El comando se construyó en el issue 189 y el recuento real, con el ámbito completo, es de doscientos treinta y ocho en producción y cuatrocientos noventa y cinco contando los tests.

Se deja escrito porque es la tercera vez seguida que pasa lo mismo y la más incómoda: la primera fue un criterio dado por cumplido sin ejecutarlo, la segunda un inventario medido con la herramienta equivocada, y la tercera la mitigación de las dos anteriores, dada por existente sin buscarla. ESCRIBIR LA MITIGACIÓN NO ES APLICARLA.

Seis, los tokens de sesión caducan. Caducan a las doce horas y se barren los ya vencidos al entrar. Verificado rompiendo el código a propósito con tres mutaciones.

Siete, Pest, Vitest, Larastan en nivel max y CI en verde. 238 tests en la API y 368 en la web, sin baseline.


LO QUE YA NO ES VERDAD, Y CONVIENE SABER QUE CAMBIÓ

Levantar el proyecto ya no son dos terminales y ocho comandos. Es docker compose up, y la APP_KEY, los .env y las migraciones se resuelven en el arranque.

El repositorio ya tiene portada. Hasta ahora la primera impresión eran diez segundos de texto.

Y hay una guía de despliegue que existe de verdad, no una afirmación en el README. ADR-005 decía que el proyecto era self-hosteable desde el primer commit y era cierto en el código, pero no había forma documentada de hacerlo.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

EL CAMINO QUE NADIE RECORRE ES EL QUE ESTÁ ROTO. Es la lección de la iteración y salió cinco veces seguidas. El criterio siete se dio por bueno sin ejecutarlo y era falso. El origen de CORS funcionaba solo con el puerto por defecto y rompía el camino documentado de cambiarlo. El clon quedaba imborrable por su propio dueño, y solo se vio al intentar borrarlo. En una vault vacía no se podía importar, que es justo cuando alguien quiere hacerlo, porque el import siempre se había probado con items delante. Y los nombres mDNS multietiqueta no resuelven, aunque avahi los publique sin protestar. Ninguno de los cinco se ve leyendo el código.

CUANDO DOS MEDIDAS DISCREPAN, LA PRIMERA HIPÓTESIS NO PUEDE SER QUE LA RARA ES LA PROPIA. Al inventariar el issue 160, un extractor en Python encontraba identificadores que grep no veía. Se dio por bueno grep y se declararon fantasmas, cuando lo cierto era lo contrario: había un byte NUL en el fichero, grep lo trataba como binario y lo omitía EN SILENCIO. El inventario original estaba bien y se «corrigió» para ajustarlo a una herramienta rota. La discrepancia entre dos medidas es información, no ruido.

UN COMPROBADOR QUE OMITE FICHEROS EN SILENCIO ES PEOR QUE NO TENER COMPROBADOR, porque devuelve un cero tranquilizador. Ninguna auditoría basada en grep había visto web/src/lib/vault/import.ts desde que se creó el 4 de agosto. Eso explica que sobreviviera a la migración del issue 115 y a la evaluación del criterio siete. Los checks del issue 62 tendrán que usar -a, o heredarán el mismo punto ciego.

UN TEST QUE ESPERA A UNA COSA Y AFIRMA OTRA DEPENDE DEL AZAR. Dos tests esperaban al post y comprobaban el cierre del diálogo sin esperarlo. Ocho pasadas en verde en local, fallo a la primera en CI, y encima ensuciando un PR que no tenía nada que ver. Hay que esperar a lo último de la cadena y comprobar después lo que lo provocó.

VER FALLAR UNA MUTACIÓN NO ES LO MISMO QUE VERLA DETECTADA. Al comprobar uno de esos tests rompiendo el componente, la primera mutación dejó el fichero sintácticamente inválido: Vite no llegó a transformarlo y la salida fue «no tests», no un test fallando. Si no se lee la salida entera, un fichero que no compila se confunde con una mutación detectada.

EL ORIGEN QUE COMPARA CORS LLEVA PUERTO SALVO QUE SEA EL ESTÁNDAR DE SU ESQUEMA. Ochenta para http, cuatrocientos cuarenta y tres para https. Componerlo mal no rompe de forma visible: la SPA carga y solo falla al registrarse, con un mensaje que parece un problema de red.

LOS PUERTOS DE DOS FICHEROS DE COMPOSE SE FUSIONAN, NO SE SUSTITUYEN. Sin !override habrían convivido el mapeo de desarrollo y el de despliegue, sirviendo la aplicación sin cifrar en paralelo a la versión HTTPS. Es el fallo más peligroso de la iteración: todo correcto en apariencia y una puerta abierta al lado.

UN BIND MOUNT CONSERVA EL UID DEL HOST, y la salida fácil —hacer chown de lo montado— deja al dueño del clon sin poder borrarlo ni actualizarlo. Y alinear el UID no basta por sí solo: el entrypoint corre como root, así que composer seguía creando vendor con UID cero. Todo lo que escriba en el clon tiene que ejecutarse como el usuario del host.

EL SERVIDOR NO PUEDE SEMBRAR DATOS DE DEMO. No es una limitación de implementación, es el zero-knowledge funcionando: el cifrado ocurre en el cliente con una clave derivada de una contraseña que el servidor nunca ve. Por eso los datos de ejemplo son un fichero cifrado más su contraseña, y por eso esa siembra demuestra el modelo mejor que explicarlo.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 5: cerrada el 7 de agosto de 2026.** Objetivo cumplido: *eVault se levanta desde un clon con un comando, se despliega con una guía verificada, y quien lo abra ve una vault con contenido en menos de un minuto.*

Once issues cerrados: ocho de los planificados más tres que salieron por el camino y que son buena parte del valor de la iteración —#184, un byte NUL que hacía invisible un fichero para `grep`; #186, dos tests que dependían del orden de resolución; y #153, la rectificación con la que empezó todo.

**Lo que cambió de fondo:** eVault dejó de ser un proyecto que solo corría en la máquina de su autor. Ahora se levanta con un comando, se despliega con una guía verificada ejecutándola, y tiene portada. `ADR-005` decía desde el primer commit que el proyecto era self-hosteable, y era cierto en el código, pero no había forma documentada de hacerlo — la mayor distancia que había entre lo que el repositorio prometía y lo que entregaba.

**Lo que no se hizo**, y se dice porque esta iteración empezó rectificando un criterio mal dado por cumplido: el renombrado de los 103 identificadores en español. Pasa a la Iteración 6 partido en seis capas, con el inventario ya medido y verificado por dos vías independientes.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_5.md`. La que más se repite, cinco veces en once issues: **el camino que nadie recorre es el que está roto.** Y la más cara de aprender: **cuando dos medidas discrepan, la primera hipótesis no puede ser que la rara es la propia** — se dio por buena a `grep` frente a un extractor propio, y `grep` era el que mentía.

No fue funcionalidad nueva y fue deliberado. `ADR-009` §4 pone «despliegue reproducible» en la primera categoría de prioridad, por delante de la legibilidad y de la funcionalidad, y al empezar la iteración **no existía**: ni `Dockerfile`, ni Compose, ni guía, mientras `ADR-005` decidía desde el primer commit que el proyecto fuera self-hosteable y el README lo afirmaba. Era la mayor distancia entre lo que el proyecto prometía y lo que entregaba.

**El hallazgo que decidió la forma del bloque de datos de ejemplo:** el servidor no puede sembrar una demo. No es una limitación de implementación, es el zero-knowledge funcionando — un seeder no puede crear items con contenido porque el cifrado ocurre en el cliente con una clave derivada de una contraseña que el servidor nunca ve. `DatabaseSeeder` lo confirma sin decirlo: crea un usuario con su vault y cero items, porque no le es posible crear ninguno. Así que la siembra es un fichero `.evault` pre-generado con contraseña publicada, importado desde la interfaz, reutilizando el formato de `ADR-011` y el import de #123. La consecuencia útil es que la propia siembra demuestra el modelo en vez de explicarlo.

Siete bloques planificados. Bloque 0, rectificar el criterio de salida 7 de la Iteración 4: #153. Bloque 1, la decisión antes del código: `ADR-012` en #154. Bloque 2, levantar con un comando: #155 y #156. Bloque 3, algo que enseñar: #157 y #158. Bloque 4, desplegar de verdad: #159. Bloque 5, la deuda: #149 y #62. Bloque 6, la deuda que destapó #153: #160. Cierre: #162.

Se completaron los bloques 0 a 4 y la mitad del 5. El 6 no llegó a empezar.

**La secuenciación salió bien**, y fue la misma apuesta que en la 4: #153 fue primero y solo, porque era lo único que estaba mintiendo en un repositorio público y costaba una tarde de documentación, no de código. Empezar por ahí puso además el listón del resto de la iteración.

**#45 quedó fuera otra vez**, con el mismo criterio de `ADR-009` §4 que la dejó fuera de la 4: sin instancia pública expuesta, un bundle grande es pulido y no fiabilidad. Su medición sí está al día: 689 kB, no 663.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 5, cerrada

Siete criterios. **Seis cumplidos y uno no**, el quinto. Ninguno se dio por bueno leyendo código o diffs, que era la lección heredada del criterio 7 de la iteración anterior — y por eso mismo el que no se cumplió se declara sin cumplir.

1. ✅ **Un clon limpio levanta con `docker compose up` y permite registrarse.** Verificado clonando **desde GitHub en un directorio nuevo y vacío del servidor**, no desde el directorio de trabajo, donde ya existen `.env`, `vendor/` y `node_modules/`. Un Compose que solo funciona sobre un árbol ya inicializado no es reproducible: es el directorio del autor con un `compose.yaml` encima (#155).
2. ✅ **El fichero de ejemplo se importa y los items aparecen descifrados.** Verificado en navegador y **desde una cuenta distinta de la que lo generó**, con otro correo y otra contraseña maestra, que es la prueba de que el fichero no está atado a quien lo creó (#157).
3. ✅ **El screenshot del README es de la aplicación real**, con los datos del fichero de ejemplo — de modo que cualquiera puede reproducir la misma pantalla. Un screenshot irreproducible envejece sin que se note (#158).
4. ✅ **La guía de despliegue se verificó ejecutándola** entera en un servidor: alias mDNS, certificados de la CA interna, registro en navegador real, y destrucción y recreación de los contenedores comprobando que los datos **y el certificado** sobreviven (#159).
5. ❌ **Cero identificadores en español en el código de producción.** **No cumplido: siguen habiendo 103.** El inventario está medido y verificado por dos vías independientes, y el renombrado pasa a la Iteración 6 partido en seis capas (#160, #178–#183). Lo que sí quedó hecho es medirlo bien, que resultó ser el trabajo difícil.
6. ✅ **Los tokens de sesión caducan** a las 12 horas y los vencidos se barren al entrar, sin necesidad de cron. Verificado **rompiendo el código a propósito** con tres mutaciones, las tres detectadas (#149).
7. ✅ **Pest, Vitest, Larastan en nivel `max` y CI en verde.** 238 tests en la API y 368 en la web, sin baseline.

Deuda que deja, con issue: el renombrado (#160 y sus seis capas) y #62, las comprobaciones de documentación en los PR. Van juntas: #160 deja escrito el comando y #62 lo mete en el CI.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Una comparación que no compara nada da un resultado tranquilizador** | `Materializado y cerrado` | Al evaluar el criterio 5 del cierre, la herramienta de volcado falló al resolver TypeScript y produjo **dos ficheros vacíos**; `diff` dijo que eran idénticos y el criterio pareció cumplido. Es el cero tranquilizador de #184 otra vez, y esta vez dentro de la evaluación del criterio que existe para evitarlo. Cualquier comparación necesita una guarda que exija haber medido algo: aquí, que los dos volcados tengan más de mil cadenas |
| **Un test que espera a una cosa y afirma otra** | `Materializado y cerrado` | Dos tests esperaban al `post` y comprobaban el cierre del diálogo sin esperarlo, cuando ese cierre ocurre un tick más tarde en el callback de la mutación. Ocho pasadas en verde en local y fallo a la primera en CI, **ensuciando además un PR que no tenía nada que ver**. Corregido en #186, y verificado rompiendo los componentes: sin la llamada al cierre, los dos fallan |
| **Un despliegue que solo funciona en la máquina del autor** | `Cerrado` | Se verificó clonando desde GitHub en un directorio vacío de un servidor real, y la guía se escribió ejecutándola. Lo que destapó hacerlo así fue justo lo que no se ve leyendo: el origen de CORS mal compuesto, el clon que su dueño no podía borrar y los nombres mDNS multietiqueta que no resuelven. Antes decía: | Es el modo de fallo natural de #155 y #159, y no se detecta desde el directorio de trabajo, donde ya está todo inicializado. Mitigación: el criterio 1 exige clon limpio en un directorio vacío, y el 4 exige ejecutar la guía en un servidor en vez de escribirla de memoria — que sería repetir el error del criterio 7 en un documento que alguien va a seguir paso a paso |
| **La contraseña del fichero de ejemplo usada como contraseña real** | `Mitigado` | Un `.evault` de ejemplo obliga a publicar la contraseña que lo abre. Mitigación en #157: que sea obviamente de demostración a simple vista, y que el aviso esté donde se lee y no en una nota al pie |
| **Desplegar por `http` en un dominio real** | `Mitigado` | El aviso está escrito en `DEPLOYMENT.md` antes que ningún comando, y `ADR-012` lo recoge como requisito de arranque y no de endurecimiento. Además el despliegue verificado usa `tls internal`, así que el camino documentado ya es HTTPS. Detalle original: | Fuera de `localhost` no existe `crypto.subtle` en contexto inseguro, así que una instancia servida por `http` en un dominio propio no es una instalación degradada: es una donde no se puede ni registrar un usuario. Quien lo descubra después habrá desplegado dos veces. Mitigación: va antes que ningún comando en la guía de #159, y es requisito explícito de `ADR-012` en #154 |
