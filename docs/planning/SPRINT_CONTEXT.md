SPRINT CONTEXT — eVault
Actualizado: 17 de agosto de 2026
Estado: Iteración 7 en curso desde el 17 de agosto de 2026. La 6 se cerró el 16.

Nota de formato: este documento está escrito en prosa plana sin Markdown, siguiendo la convención del proyecto para instrucciones dirigidas a Claude Code.

Este archivo es el puente entre sesiones y se lee entero al empezar. Por eso es corto, y hay que mantenerlo corto: creció hasta las cuatrocientas cincuenta líneas durante la Iteración 1 y dejó de cumplir su función, porque lo único que se leía eran las últimas veinte. Lo que no cabe aquí vive en otro sitio y se enlaza.

Qué NO se escribe aquí. Ni qué issues están cerrados ni cuál es el siguiente: eso se lee en docs/planning/STATUS.md, que se genera desde GitHub. Ni el entorno local, que está en docs/development/SETUP.md. Ni el historial de lo ya hecho, que se archiva por iteración en docs/planning/archive/. Una copia se desincroniza siempre, porque nada obliga a actualizarla.


QUÉ ES eVault

eVault es un gestor de contraseñas y secretos personales con modelo zero-knowledge. El servidor nunca puede leer los datos del usuario: toda la criptografía ocurre en el cliente antes de que los datos salgan del dispositivo, y la base de datos solo almacena blobs cifrados opacos.

NO se comercializa, y eso está decidido en ADR-009. Los dos propósitos reales son que el desarrollador lo use para sus propias contraseñas en una instancia self-hosted, y que el repositorio sea público y sirva como muestra de trabajo en procesos de selección. Quien lo lea estará evaluando criterio técnico: código, decisiones de seguridad, arquitectura y documentación. De ahí que el self-hosting sea el único modo de despliegue y que ADR-005 gane importancia en lugar de perderla.

Quedan fuera del alcance, y conviene no reabrirlos por inercia: vaults compartidas, organizaciones, plan Team y el panel Filament de administración de plataforma. El multi-tenancy ya construido NO se retira, porque el aislamiento cross-tenant con sus tests es precisamente lo que hay que poder enseñar.

Los clientes previstos siguen siendo una SPA web, una app nativa iOS/Android y una extensión de navegador para Chrome. Ahora mismo solo se está construyendo la web.


DÓNDE ENCONTRAR CADA COSA

Estado del backlog, prioridades y dependencias: docs/planning/STATUS.md, generado desde GitHub.
Entorno local, stack, versiones y arranque: docs/development/SETUP.md.
Por qué el proyecto está construido así: los catorce ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Qué llave abre qué y qué se pierde con cada una: docs/architecture/KEYS.md, que es de consulta y responde sin abrir ningún ADR.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los catorce ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import. ADR-012 estrategia de despliegue. ADR-013 emplazamiento y operación de la instancia personal, que es además donde queda corregida la imprecisión de ADR-012 sección 2.3 al meter Tailscale, Cloudflare y una VPN propia en el mismo saco. ADR-014 cambio de correo electrónico, y de ahí lo único que hay que tener presente sin abrirlo: cambiar el correo SÍ invalida la clave de recuperación, al contrario que rotar la contraseña maestra, porque el correo es el salt del HKDF que deriva sus claves.

Del 012 conviene tener presente una cosa sin abrirlo, porque decide si un despliegue funciona o no: HTTPS no es endurecimiento, es requisito de arranque. Fuera de localhost no existe crypto.subtle en contexto inseguro, así que una instancia servida por http en un dominio propio o en una IP de la red local no es una instalación limitada, es una donde no se puede ni registrar un usuario. Y la excepción de .localhost no rescata nada aquí: vale en la máquina que ejecuta el navegador, no desde otro dispositivo de la red.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 7 está en curso desde el 17 de agosto de 2026. Su objetivo es que eVault deje de ser un proyecto que funciona y pase a ser la vault donde están las contraseñas de verdad, que es el propósito número uno de ADR-009 y llevaba tres iteraciones esperando. Diecinueve issues, del 214 al 232, en cinco bloques: las decisiones (ADR-013 emplazamiento de la instancia, ADR-014 cambio de correo), la fiabilidad que falta antes de meter contraseñas reales, el cambio de correo, la instancia en kastor, y la migración con el cierre. El plan entero, con sus ocho criterios de salida y sus riesgos, está en las secciones 1, 5 y 6 de STATUS.md.

La apuesta de secuenciación, que conviene no deshacer: la fiabilidad va ANTES del despliegue y la migración de las contraseñas reales va ÚLTIMA, con seis bloqueantes. Es la primera iteración en la que un fallo cuesta datos que no están en ningún otro sitio; hasta ahora todo era reproducible.

Tres cosas que aparecieron al planificar y que no estaban en ningún documento, todas medidas y con issue. Una, los dos módulos que tocan el material que abre la vault tenían CERO cobertura, porque los tests de sus pantallas los sustituyen con vi.spyOn, y no se veía en el total. Los dos están ya al cien por cien: masterPassword.ts en el issue 217 y recovery.ts en el 218, y con eso NO QUEDA NINGÚN MÓDULO DE lib/vault A CERO, que es el criterio de salida 2 de la iteración. Y ya está en el CI, en el issue 219: hay umbral por fichero sobre lib/vault en vite.config.ts y el job de tests corre npm run test:coverage, así que el criterio de salida 2 está cumplido entero. Del 219 hay que saber una cosa antes de tocar ese umbral: perFile no es redundante y no se puede quitar, porque sin él un umbral con glob se evalúa sobre el agregado de los ficheros que casan y un módulo nuevo a cero pasaría sin más. Está comprobado plantando un fichero sin tests. El issue 202 había afirmado por escrito que masterPassword.ts estaba cubierto, usándolo como argumento para no auditar. Dos, la clave de la vault no vencía nunca mientras la pestaña siguiera abierta, mientras los tokens caducan a las 12 horas desde el 149: resuelto en el issue 220, que bloquea a los 15 minutos de inactividad con aviso a los 14. De ahí conviene saber por qué NO usa un setTimeout: los navegadores estrangulan los temporizadores de las pestañas ocultas, así que el bloqueo llegaría cuando ya no protege. Compara marcas de tiempo, y hay un test que mueve el reloj sin ejecutar temporizadores para probar justo eso. Tres, el generador de STATUS.md solo leía 100 issues y decía que el documento estaba al día, arreglado en el 230.

Y un dato de método que salió al cerrar el 217 y que conviene no volver a descubrir: LA TABLA DE TEXTO DE LA COBERTURA OMITE LOS FICHEROS AL CIEN POR CIEN, así que la ausencia de una fila es ambigua y leer esa tabla no sirve para auditar. Desde el 219 eso importa menos, porque el umbral no depende de que nadie la lea. Para medir de verdad hay que pedir el reporte json-summary. Es la misma clase de fallo que el resto: una herramienta que calla en vez de decir.

La Iteración 6 se cerró el 16 de agosto de 2026 y el repositorio dejó de tener afirmaciones que nadie podía comprobar. El código está entero en inglés —cero identificadores en español en las seis áreas, producción y tests—, hay comandos que lo comprueban, y el CI los ejecuta en cada PR. Hay 379 tests en la web, 238 en la API, 60 del propio utillaje, análisis estático en nivel max sin baseline y CI en verde. Las cifras incluyen el 197 y el 202, cerrados justo después de la iteración.

Catorce issues cerrados, tres de ellos abiertos por el camino.

Lo que hay que saber de lo hecho, para no redescubrirlo. Hay tres comandos nuevos y conviene conocerlos antes de tocar nada: ./scripts/check-identifiers.py comprueba que los identificadores estén en inglés y --all incluye los tests; ./scripts/check-docs.py comprueba bytes NUL, marcadores de conflicto, los seis marcadores de sección manual de STATUS.md y las referencias a documentos que no existen; y node scripts/identifiers/dump-ui-text.mjs vuelca el texto visible para compararlo antes y después de un renombrado. Los tres tienen tests, y el workflow «repositorio» los ejecuta siempre y sin filtro de paths.

Dos cosas del comprobador de identificadores que hay que tener presentes al escribir código nuevo. La lista de scripts/identifiers/english.txt es de PERMITIDOS, así que una palabra inglesa nueva se reporta hasta que alguien la añade, y eso es lo buscado. Y comprueba la gramática solo en la parte que tiene forma reconocible: desde el issue 197 marca las palabras funcionales españolas pegadas a otra, como aItem o deVault, pero useVaultPersonal son tres palabras inglesas en orden español y sigue pasando. Eso hay que verlo leyendo.

El detalle de la iteración y sus lecciones está en docs/planning/archive/ITERACION_6.md. Conviene leerlo antes de tocar el utillaje, la lista de palabras o la carga diferida de las rutas.

La Iteración 5 se cerró el 7 de agosto de 2026 y eVault dejó de ser un proyecto que solo corría en la máquina de su autor. Se levanta con docker compose up desde un clon, se despliega en un servidor con una guía que se escribió ejecutándola, y el README tiene por fin una portada que enseñar. Hay 238 tests en la API y 368 en la web, análisis estático en nivel max sin baseline, y CI en verde.

Once issues cerrados, tres de ellos sin planificar y siendo buena parte del valor: el 184, un byte NUL que hacía invisible un fichero entero para grep; el 186, dos tests que dependían del orden de resolución; y el 153, la rectificación del criterio de salida siete de la iteración anterior, con la que empezó todo.

Lo que hay que saber de lo hecho, para no redescubrirlo. Levantar el proyecto es un comando y no ocho, y lo que se aprendió montándolo está en SETUP.md. Desplegarlo tiene su propia guía en docs/operations/DEPLOYMENT.md, y ahí está lo que costó averiguar: que mDNS solo resuelve nombres de una etiqueta, que el backup sin -u www-data deja copias que su dueño no puede recuperar, y que los puertos de dos ficheros de compose se fusionan en vez de sustituirse. Hay además un fichero examples/sample-vault.evault con siete entradas ficticias que se importa con la contraseña publicada en el README: sirve para ver la aplicación con contenido sin inventarse nada, y de paso es la demostración más concreta del zero-knowledge que tiene el repositorio, porque el servidor NO PUEDE sembrar datos y por eso la única vía es entregar un fichero cifrado y su contraseña.

El detalle de la iteración y sus lecciones está en docs/planning/archive/ITERACION_5.md. Conviene leerlo antes de tocar el despliegue, el Compose o cualquier cosa que dependa de auditar el repositorio con grep.

El entorno de verificación es kastor, el servidor de casa. No se documenta aquí porque el repositorio es público y son datos de una red doméstica.

La Iteración 4 se cerró el 5 de agosto de 2026 y eVault ya no es una vault en la que dé miedo meter contraseñas reales. Se puede exportar e importar, cambiar la contraseña maestra, recuperar el acceso con una clave de recuperación si se pierde, y hacer copia de seguridad de la instancia con dos comandos de Artisan. Hay 230 tests en la API y 367 en la web, análisis estático en nivel max sin baseline, y CI en verde.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_4.md. Conviene leerlo antes de tocar la rotación de contraseñas, la recuperación o el export, y también antes de hacer cualquier renombrado masivo. Dos cosas de ahí que valen por sí solas: el middleware ability de Sanctum NO sirve para restringir, porque un token de sesión normal lleva la capacidad * y * satisface cualquier comprobación; y el texto de la interfaz se rompe cruzando saltos de línea, así que una auditoría línea a línea no lo ve.

El mapa del cliente, para no tener que buscarlo. La primitiva criptográfica es lib/vault/crypto.ts, el único sitio que llama a crypto.subtle. Encima está lib/vault/payload.ts, que cifra y descifra el contenido de los items. La clave vive en lib/vault/keyInMemory.ts, un store sin persist. Abrirla es unlockVault, en lib/vault/unlock.ts. Y lo que se construyó en esta iteración: masterPassword.ts para rotarla, recoveryKey.ts y recovery.ts para la clave de recuperación, y export.ts e import.ts.

Antes de dar por vivo el entorno local, comprobarlo: suele estar caído al empezar la sesión.

Tres lecciones de método de la Iteración 5, y conviene tenerlas delante porque las tres se pagaron caras.

EL CAMINO QUE NADIE RECORRE ES EL QUE ESTÁ ROTO, que salió cinco veces seguidas. El criterio siete se dio por bueno sin ejecutarlo y era falso. El origen de CORS funcionaba solo con el puerto por defecto y rompía el camino documentado de cambiarlo. El clon quedaba imborrable por su dueño y solo se vio al intentar borrarlo. En una vault vacía no se podía importar, que es justo cuando alguien quiere hacerlo, porque el import siempre se había probado con items delante. Y los nombres mDNS de más de una etiqueta no resuelven, aunque avahi los publique sin protestar. Ninguno de los cinco se ve leyendo el código.

CUANDO DOS MEDIDAS DISCREPAN, LA PRIMERA HIPÓTESIS NO PUEDE SER QUE LA RARA ES LA PROPIA. Al inventariar el renombrado, un extractor propio encontraba identificadores que grep no veía. Se dio por bueno grep y se declararon inexistentes, cuando lo cierto era lo contrario: había un byte NUL en el fichero y grep lo omitía EN SILENCIO. Se estuvo a punto de corregir un inventario correcto para ajustarlo a una herramienta rota. La discrepancia entre dos medidas es información, no ruido.

UN COMPROBADOR QUE OMITE FICHEROS EN SILENCIO ES PEOR QUE NO TENER COMPROBADOR, porque devuelve un cero tranquilizador. Cualquier auditoría con grep tiene que usar -a, o heredará ese punto ciego.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

Dos, y las dos salieron al planificar la Iteración 7: el 229, que no se puede llegar a la vault desde fuera de la red local, y el 230, el generador de STATUS.md truncando a 100 issues. El 229 se deja fuera de la 7 a propósito, porque puede acabar resolviéndose con una instancia en hosting compartido en vez de con un túnel, y esa decisión no es de esta iteración. Las dos que dejó la Iteración 6 —el 197 y el 202— se cerraron después de ella.

Dentro del alcance de la 7, y con issue, están además las dos que se descubrieron midiendo: la cobertura cero de masterPassword.ts y recovery.ts (217 y 218) y el bloqueo por inactividad (220).

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

Empezar la Iteración 7 por el issue 214, que es su plan, y seguir el orden de los bloqueantes declarados en GitHub. Lo tomable sin nada delante está en la sección 2 de STATUS.md.

La instancia personal está desplegada en kastor desde el 17 de agosto, en ~/apps/evault y por el puerto 443, sirviendo evault.local y evault-api.local con la CA interna de Caddy. El certificado de la CA está instalado en el Windows de casa, el usuario real registrado, y el ciclo verificado en navegador desde otro dispositivo: crear item, recargar para que la vault se bloquee, desbloquear y descifrar. Y comprobado contra la base de datos real que el servidor no puede leer nada: la cadena guardada no aparece en vault_items, cero coincidencias, y lo que hay son 172 bytes de ciphertext con version 2. Lo que falta ahí es meter las contraseñas de verdad, que es el issue 227.

Las copias de seguridad salen de la máquina desde el issue 225: un cron a las 3 llama a scripts/offsite-backup.sh, que pide la copia, la cifra con age y la sube con rclone al remoto llamado nube. El cifrado es ASIMÉTRICO y eso es lo que hay que entender antes de tocarlo: en kastor solo está la clave pública, así que la máquina cifra y NO descifra, y quien la comprometa no puede leer las copias que ya subió. La privada la custodia su dueño fuera, y sin ella las copias son basura. Verificado con el cron disparando solo, y las tres formas de fallo comprobadas rompiéndolas.

Y del issue 226 sale lo que hay que saber antes de actualizar esa instancia: DOCKER COMPOSE UP -D --BUILD NO APLICA LAS MIGRACIONES. El código va por volumen y no dentro de la imagen, así que un git pull con migraciones nuevas no cambia la imagen, y sin cambio de imagen compose no recrea el contenedor; como las migraciones las lanza el entrypoint al arrancar, se quedan pendientes SIN ningún error, con el código nuevo y el esquema viejo. Hace falta --force-recreate, o lanzar migrate a propósito. Está en la sección 7 de DEPLOYMENT.md. El certificado para los demás dispositivos está en ~/evault-ca.crt de la propia máquina.

Dos fricciones de Windows que costaron un rato y están ya en la guía. Una, curl.exe NO sirve para verificar el certificado: usa schannel, que exige comprobación de revocación, y una CA local no publica CRL, así que falla con CRYPT_E_NO_REVOCATION_CHECK aunque esté bien instalado. Si el error pasa de SEC_E_UNTRUSTED_ROOT a ese, la confianza YA funciona. Y dos, para consultar MySQL hay que dejar que la contraseña la expanda el shell del contenedor con comillas simples, porque leer el .env con $(grep ...) lo intenta expandir PowerShell en la máquina local y manda una contraseña vacía.

Un dato del despliegue que ahorra un susto: compose.yaml fija name evault, así que el prefijo de los volúmenes NO depende del directorio del clon. Se puede mover el clon sin perder datos, y como corolario dos clones en la misma máquina COMPARTEN volúmenes, de modo que la separación que pide ADR-009 sección 4 no se logra con carpetas distintas.

De kastor conviene saber cuatro cosas más antes de tocarlo, comprobadas el 17 de agosto. El despliegue de prueba de la Iteración 5 ya está desmantelado: cero contenedores y cero volúmenes, así que el de la instancia personal es un despliegue desde cero y ADR-009 sección 4 se cumple sin retirar nada. Lo que quedan son las imágenes huérfanas y el servicio evault-mdns activo publicando un alias hacia nada, que es inocuo pero confunde el diagnóstico porque el nombre resuelve. La máquina se apaga a veces a propósito, así que la disponibilidad es un requisito, y ADR-013 la trata. Y la cuarta, que salió al limpiarla en el issue 223 y no estaba prevista: SU RELOJ NO ES MONÓTONO ENTRE ARRANQUES. El RTC marca 2019 por la pila de la BIOS, y systemd-timesyncd restaura la fecha del último apagado antes de que NTP corrija, así que durante los primeros segundos de cada arranque la máquina cree estar en una fecha pasada y los timestamps de systemd de ese boot mienten. Eso destapó el issue 240, ya cerrado: la retención de copias ordenaba por nombre, que lleva la fecha, de modo que un reloj que salta atrás le hacía borrar la copia MÁS RECIENTE. Ahora el nombre lleva delante un número de secuencia que sale de las copias que ya hay, así que crece siempre y no depende de ningún reloj, y el comando avisa si detecta que la fecha ha ido hacia atrás.

Del backup hay un hallazgo que decidió la forma del issue 225 y que conviene no perder: un backup en el mismo disco que los datos no es una copia de seguridad. Los volúmenes y el fichero del cron en la misma máquina se van juntos con el disco, encendida o apagada. ADR-011 sección 5 ya apuntaba ahí al decir que el backup del servidor y el export cifrado son complementarios y no redundantes.

El cambio de correo está entero desde los issues 221 y 222, endpoint y pantalla. De ahí conviene saber dos cosas. Una, la normalización del correo vive en un solo sitio, App\Application\Auth\EmailAddress, y no repetida en cinco: es parte del contrato criptográfico y una copia que divergiera no rompería ningún test, se manifestaría como una vault que no abre. Y dos, si al cambiar el correo no llega un envoltorio de recuperación nuevo, el viejo SE BORRA en vez de quedarse: un envoltorio que ya no puede abrirse, guardado como si sirviera, es peor que no tener ninguno. Para saber a quién hay que darle una clave nueva, /auth/me expone has_recovery_key, un booleano derivado: el cliente no podía deducirlo de ninguna otra cosa, y sin él la pantalla solo podía elegir entre molestar a unos o dejar a otros con una llave que ya no abre.

La asimetría que se va a malinterpretar: rotar la contraseña maestra NO invalida la clave de recuperación, pero cambiar el correo SÍ, porque el correo es el salt del HKDF que deriva sus claves en crypto.ts línea 352.

CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
