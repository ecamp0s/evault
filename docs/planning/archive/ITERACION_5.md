ITERACIÓN 5 — Historial y lecciones aprendidas

Archivo de la Iteración 5, cerrada el 7 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que eVault dejó de ser un proyecto que solo corría en la máquina de su autor: ahora se levanta con un comando, se despliega con una guía verificada, y tiene una portada que enseñar. Si algo falla al desplegar, al levantar el Compose o al importar el fichero de ejemplo, merece la pena buscar aquí antes de investigar desde cero.

El objetivo era que eVault se levantara desde un clon con un comando, se desplegara con una guía verificada, y que quien lo abriera viera una vault con contenido en menos de un minuto. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


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

Cinco, cero identificadores en español en el código de producción, comprobado por un comando que queda en el repositorio. NO CUMPLIDO. Siguen habiendo 103. El comando de comprobación existe y funciona; lo que no se hizo es el renombrado, que pasa a la Iteración 6 partido en seis capas.

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
