ITERACIÓN 3 — Historial y lecciones aprendidas

Archivo de la Iteración 3, cerrada el 3 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que el producto pasó a ser lo que dice ser, así que casi todo lo de abajo toca criptografía o el ciclo de sesión, y ahí un detalle olvidado cuesta datos de usuario. Si algo se comporta de forma rara en esas zonas, merece la pena buscar aquí antes de investigar desde cero.

El objetivo era que el servidor dejara de poder leer nada del usuario y que la vault se bloqueara y se desbloqueara con la contraseña maestra. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.

QUÉ SE HIZO

Doce issues: ocho nuevos, del 79 al 86, y cuatro arrastrados, el 59, el 63, el 73 y el 77. Por el camino salieron tres issues nuevos: el 91 con la deuda del entorno, el 97 con la migración de los identificadores a inglés y el 101 de este cierre.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub.

El issue 79 planificó la iteración y cerró lo que quedaba abierto al terminar la anterior: qué deuda entraba, qué funcionalidad y qué se hacía con los datos de desarrollo.

El issue 80 es el ADR-008, la arquitectura de claves. Va primero porque bloquea todo lo demás y porque una decisión mal tomada ahí se paga recifrando datos que solo el usuario puede descifrar.

El issue 81 es lib/vault/cripto.ts, la primitiva, escrita con sus tests antes de que ninguna pantalla la usara.

El issue 82 enseña al servidor a guardar la clave de vault envuelta, en vault_members.

Los issues 83 y 84 sustituyen registro y login por el modelo derivado. Desde ahí la contraseña maestra no sale del dispositivo.

El issue 59 sustituye la codificación temporal por cifrado real, y el 73 deja de persistir el token, con lo que se cierra ADR-007.

Fuera de esa cadena: el 77 con la Content-Security-Policy, el 63 con la investigación del disparador del workflow status, el 85 con el generador de contraseñas y el 86 con la búsqueda de items.

CRITERIOS DE SALIDA, Y CÓMO SE VERIFICÓ CADA UNO

Eran ocho y se cumplieron los ocho. Todos se comprobaron abriendo el navegador o inspeccionando la base de datos, no leyendo el código.

Uno, inspeccionando la base de datos no se puede leer ningún dato de usuario. Se guardó una credencial desde el navegador y se abrió la fila en MySQL: version 2, ciphertext opaco, y ninguna de las cinco cadenas escritas aparece. Descodificar el base64, que hasta ese día devolvía el JSON en claro, ya no produce nada legible.

Dos, la contraseña maestra no aparece en ninguna petición. Verificado en la pestaña de red: el cuerpo del alta y el del login llevan un hash en base64 donde antes iba la contraseña.

Tres, el token de sesión no está en localStorage, sessionStorage, cookies ni IndexedDB. Comprobado en el navegador; lo único que queda guardado es el nombre y el correo de quien entró.

Cuatro, recargar bloquea la vault y la interfaz lo presenta como bloqueo. Hay una pantalla propia que no pide el correo, saluda con él y explica por qué ha pasado.

Cinco, un fallo de descifrado se comunica y nunca escribe datos corruptos encima de los buenos. El cifrado ocurre antes de mandar la petición, así que un fallo deja intacto el item anterior.

Seis, la estructura de vault_items no cambió y version distingue el esquema nuevo. El test que enumera sus columnas sigue pasando sin tocarlo.

Siete, la aplicación sirve una Content-Security-Policy y la consola no reporta violaciones. Verificado recorriendo la aplicación entera con el build de producción, que es más estricto que el de desarrollo.

Ocho, Pest, Vitest, Larastan y CI en verde: 276 tests en la web y 169 en la API, con composer analyse en nivel max y sin baseline.

LO QUE YA NO ES VERDAD, Y CONVIENE SABER QUE CAMBIÓ

La advertencia que encabezaba STATUS.md y SPRINT_CONTEXT durante dos iteraciones —que el contenido no estaba cifrado y que no se podía desplegar con datos reales— dejó de aplicar al cerrar el issue 59. Fue la apuesta de la Iteración 2: fijar el contrato antes de meter criptografía, con la condición de no desplegar mientras durase. La condición se respetó, y por eso las filas de la versión 1 se pudieron borrar sin más en vez de arrastrarlas.

El contrato aguantó, que era lo que había que comprobar. Al llegar el cifrado real no hubo que tocar ni la tabla vault_items ni ninguna ruta: register ganó dos campos de entrada y GET /api/vaults dos de salida, y eso fue todo.

LECCIONES DE MÉTODO, Y SON LAS MÁS IMPORTANTES DE ESTA ITERACIÓN

Ver pasar un test no demuestra que sirva. En esta iteración se comprobó dos veces rompiendo el código a propósito, y el resultado fue distinto cada vez.

En el módulo criptográfico, las cuatro mutaciones se detectaron: nonce fijo, descifrado que se traga el fallo, correo sin normalizar, y hash de autenticación igual a la clave maestra. Esta última es la que importaba, porque si el hash que viaja al servidor fuese la clave maestra el servidor podría descifrar la vault entera, y había exactamente un test que lo cazaba.

En el generador de contraseñas, dos de cuatro NO se detectaron, y los tests hubo que rehacerlos. El del sesgo de módulo era estadístico: medía la distribución sobre una muestra grande, y con un sesgo del diez por ciento cualquier margen que no falle por azar lo deja pasar. Se sustituyó por uno determinista que controla la entrada, forzando getRandomValues a devolver un valor del tramo que hay que descartar. El del barajado contaba caracteres distintos en la primera posición, cuando lo que había que mirar era la clase: sin barajar, el primero sigue siendo una minúscula cualquiera de veinticinco.

La regla que sale de ahí: un test estadístico no detecta sesgos pequeños, y ante la duda hay que controlar la entrada en vez de medir la salida.

Segunda lección de método: dos tests se invirtieron durante la iteración, y esa es la forma correcta de tratarlos cuando la garantía cambia de signo. El que prohibía prometer cifrado ahora falla si la promesa desaparece. El que comprobaba que la sesión sobrevivía al refresco ahora comprueba lo contrario. Ninguno se borró.

LECCIONES DEL BACKEND

withPivot solo afecta a la consulta que se lanza, así que hay que declararlo en los dos extremos de la relación. Una columna declarada en Vault::members pero no en User::vaults llega a null al leer desde el usuario, sin que nada avise, y revienta a tres capas de distancia dentro del DTO.

Las excepciones se convierten en respuesta fuera del pipeline de middleware. Un middleware que añade cabeceras no las pone en un 401 de Sanctum ni en un 404 de ruta inexistente, que son justo las respuestas que alguien acaba abriendo directamente en un navegador. Hay que engancharlas también al manejador de excepciones.

La idempotencia de un servicio se vuelve peligrosa cuando el servicio escribe material criptográfico. CreatePersonalVault existe también para reparar a un usuario sin vault, así que puede llamarse sobre uno que ya lo tiene; si sobrescribiera la clave envuelta, los items quedarían cifrados con una clave que ya nadie tiene.

LECCIONES DEL FRONTEND

crypto.subtle NO existe fuera de un contexto seguro, y el entorno local sirve por http sobre un dominio que no es localhost. Es la misma causa que deja al entorno sin navigator.clipboard, descubierta en la Iteración 2, pero esta vez tumba el núcleo del producto. El fallo llega como Uncaught (in promise) sin mensaje, porque lo que revienta es una propiedad de undefined dentro de una promesa. Se trabaja en localhost:5173, que los navegadores tratan como excepción. Tiene issue, el 91.

crypto.subtle sí funciona en el entorno jsdom de Vitest sin ningún apaño en el setup, al contrario que matchMedia. Conviene comprobarlo antes de escribir tests criptográficos: si hubiera hecho falta un polyfill, los tests habrían estado midiendo el polyfill.

Derivar con 600.000 iteraciones no congela la interfaz. Medido en navegador con un contador de frames: 60 fps de media durante todo el registro y ningún hueco por encima de 91 ms, porque crypto.subtle no trabaja en el hilo principal. No hace falta Web Worker.

Desde TypeScript 5.7 un Uint8Array sin argumento de tipo no se puede pasar a crypto.subtle, porque su buffer podría ser un SharedArrayBuffer y las firmas piden BufferSource. Se resuelve con un alias en la frontera donde se crean los bytes, no con aserciones repartidas.

TanStack Query llama a queryFn con su propio contexto como primer argumento, así que una función que acepte un parámetro opcional no se le puede pasar por referencia.

jsdom no implementa el comportamiento de teclado de input[type=range]. Un test que intentara mover el control con las flechas mediría jsdom y no la aplicación; lo que sí se puede comprobar es que el control es alcanzable y declara sus límites, y las flechas se verifican en navegador. Es la misma lección que dejó el nombre accesible de los botones en la Iteración 2.

El proyecto usa Base UI y no Radix, con el preset base-nova de shadcn. Se documentó mal en el issue 77 y se corrigió en el 85. Base UI compone con render y no con asChild.

LO QUE SOLO SE VE ABRIENDO EL NAVEGADOR

Tres cosas de esta iteración no las habría encontrado ningún test, y las tres son de la misma familia que las de la Iteración 2: la interfaz haciendo algo distinto de lo que dice.

La sesión hay que publicarla entera o no publicarla. La primera versión del login guardaba el token y después abría la vault, y con eso bastaba para que el guard SoloSinSesion navegara a la portada, desmontara el login y se llevara por delante el mensaje de error del desbloqueo. Lo que se veía era un formulario que se vaciaba solo, sin decir nada, con un 401 suelto en la consola. Los tests de auth no montan router y el de la pantalla no tiene guard por encima, así que ninguno podía verlo.

Recargar dejaba sesión sin clave, y la pantalla decía «comprueba tu conexión». Es falso: la red está bien y reintentar no arregla nada. Salió al abrir el navegador después de cerrar el 59, y se corrigió con un estado propio antes de que el 73 lo convirtiera en el bloqueo de verdad.

Al añadir la navegación al estado de vault bloqueada se usó useNavigate, y eso rompió diez tests: exige un Router que esa pantalla no monta. El patrón correcto ya estaba documentado en lib/sesion.ts desde la Iteración 1, en el interceptor de 401: vaciar el store basta, porque el guard reacciona al cambio y navega.

LECCIONES DE PRODUCTO

Hay decisiones que parecen técnicas y son de producto, y se reconocen porque la respuesta correcta cambia según para qué sirva la función.

La normalización de la ñ en la búsqueda. Conservarla es lo correcto al ordenar, porque en español es una letra propia; es incorrecto al buscar, porque quien escribe «espanol» espera encontrar «Español» y no encontrarlo parece que la entrada no existe. La regla que salió: en una búsqueda, un falso positivo molesta y un falso negativo esconde.

Distinguir «credenciales incorrectas» de «no se puede abrir la vault». Son dos fallos con la misma pinta y consecuencias muy distintas: en el primero el usuario reescribe la contraseña, en el segundo el servidor ya ha dicho que era la correcta y no hay nada que reescribir. El segundo mensaje no promete que se pueda arreglar, porque puede que no se pueda.

El aviso de que no hay recuperación de la contraseña maestra. Lo exigía ADR-001 desde el principio y no estaba en ninguna pantalla. Va antes del botón y explica el porqué, porque no poder recuperarla es la consecuencia directa de que nadie más pueda leerla; entendido así deja de parecer una carencia del producto.

La contraseña no es un campo buscable, y el generador descarta los caracteres ambiguos. Las dos son decisiones pequeñas con el mismo criterio detrás: pensar en el momento en que el usuario usa la función, no en la función.

LECCIONES DE PROCESO

Un disparador de CI que parece de más puede no serlo. Mergear un pull request ES un push a master, y lo hace GitHub en el servidor, así que no aparece en el historial de comandos de nadie. El issue 63 se abrió por eso y se cerró documentándolo en el propio workflow, tras comprobar contra la API que en cien ejecuciones la rama había sido siempre master.

La convención de idioma del código se acordó a mitad de iteración, cuando ya había mucho escrito en español siguiendo lo que traía el proyecto. Se dejó escrita en CLAUDE.md de inmediato en vez de esperar al issue de migración, porque una regla que no está donde se lee al empezar no existe. Y no se renombra nada de paso al tocar un fichero antiguo: eso convertiría cualquier cambio en un diff inrevisable. Es el issue 97.

SPRINT_CONTEXT.md volvió a crecer, hasta 126 líneas, acumulando las lecciones de la iteración en curso. Es el mismo mecanismo que lo llevó a 450 líneas en la Iteración 1, solo que detectado antes. El material no sobraba: sobraba ahí, y su sitio es este archivo.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 3: cerrada el 3 de agosto de 2026.** Objetivo cumplido: *el servidor deja de poder leer nada del usuario, y la vault se bloquea y se desbloquea con la contraseña maestra.*

Es la iteración que cumple `ADR-001`. Las dos anteriores construyeron el producto sobre dos excepciones deliberadas al principio fundamental —autenticación convencional en la Iteración 1, contenido sin cifrar en la Iteración 2—, tomadas para fijar y validar el contrato antes de introducir criptografía. Esta las retiró las dos.

**La advertencia que encabezaba este documento durante dos iteraciones ya no aplica.** El contenido está cifrado con AES-256-GCM y la condición de no desplegar con datos reales queda levantada. La apuesta salió bien y conviene decirlo: al llegar el cifrado real no hubo que tocar ni `vault_items` ni ninguna ruta. `register` ganó dos campos de entrada, `GET /api/vaults` dos de salida, y eso fue todo.

Doce issues, ocho nuevos y cuatro arrastrados. La columna vertebral fue una cadena que va de la decisión al código y del código a la interfaz: `ADR-008` fijó la arquitectura de claves (#80), el módulo criptográfico y sus tests fueron el suelo (#81), el servidor aprendió a guardar la clave de vault envuelta (#82), y encima fueron registro (#83), login (#84), cifrado real (#59) y bloqueo de la vault (#73). Fuera de esa cadena: la CSP (#77), el trigger del workflow `status` (#63), el generador de contraseñas (#85) y la búsqueda de items (#86).

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_3.md`. Lo que más se repite ahí: **ver pasar un test no demuestra que sirva.** Se comprobó dos veces rompiendo el código a propósito, y en el generador de contraseñas dos de cuatro mutaciones no se detectaban.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 3, cerrada

Los ocho criterios de la Iteración 3, todos cumplidos. Ninguno se dio por bueno leyendo el código: todos se comprobaron abriendo el navegador o inspeccionando la base de datos.

1. ✅ **Inspeccionando la base de datos no se puede leer ningún dato de usuario.** Guardada una credencial desde el navegador, la fila en MySQL sale con `version 2` y un `ciphertext` opaco; ninguna de las cinco cadenas escritas aparece, y descodificar el base64 ya no produce nada legible (#59).
2. ✅ **La contraseña maestra no aparece en ninguna petición.** Verificado en la pestaña de red: el cuerpo del alta y el del login llevan un hash en base64 donde antes iba la contraseña (#83, #84).
3. ✅ **El token no está en `localStorage`, `sessionStorage`, cookies ni IndexedDB.** Lo único que queda guardado es el nombre y el correo de quien entró, que no son secretos y son lo que permite el bloqueo (#73).
4. ✅ **Recargar bloquea la vault, presentado como bloqueo y no como expulsión.** Pantalla propia que no pide el correo, saluda con él y explica por qué ha pasado (#73, `ADR-007`).
5. ✅ **Un fallo de descifrado se comunica y nunca escribe encima de los datos buenos.** El cifrado ocurre antes de mandar la petición, así que un fallo deja intacto el item anterior (#81, #59).
6. ✅ **`vault_items` no cambió** y `version` distingue el esquema nuevo. El test que enumera sus columnas sigue pasando sin tocarlo (#59, #82).
7. ✅ **La aplicación sirve una CSP** y la consola no reporta violaciones, verificado con el build de producción y no solo con el de desarrollo. `npm run dev` sigue con HMR (#77).
8. ✅ **Pest, Vitest, Larastan y CI en verde.** 276 tests en la web y 169 en la API; `composer analyse` en nivel `max` sin baseline.

Extra no previsto en los criterios: `ADR-008`, el generador de contraseñas y la búsqueda de items.

Los criterios de las iteraciones anteriores están en `docs/planning/archive/`.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| El contenido de los vault items no está cifrado | `Cerrado` | Resuelto en #59. El servidor almacena AES-256-GCM y no puede leer nada, comprobado en MySQL. **La condición de no desplegar con datos reales queda levantada** |
| El token en `localStorage` es accesible a un XSS | `Cerrado` | Resuelto en #73. Vive solo en memoria y muere al recargar, igual que la clave de cifrado. `ADR-007` cumplido |
| Sin CSP en ninguna parte | `Cerrado` | Resuelto en #77. La SPA la lleva en su build y la API la sirve Laravel con `default-src 'none'` |
| Los parámetros KDF quedan fijos en el cliente | `Aceptado, con trigger` | Consecuencia de usar el correo como salt para no exponer un endpoint de prelogin, que sería un oráculo de enumeración de cuentas. Subir las iteraciones exigirá construirlo igualmente y re-derivar. Argumentado en `ADR-008` |
| `crypto.subtle` no existe en el entorno local | `Cerrado` | Resuelto en #112. El entorno se movió a `app.evault.localhost`: la especificación de contextos seguros considera de confianza todo host acabado en `.localhost`, así que hay criptografía por `http` y sin certificado. Verificado registrando y guardando un item desde el navegador. `.test` no habría servido. Cierra #91 |
| Query sin `vault_id` filtrando datos entre tenants | `Mitigado` | El acotado vive en un único sitio, `VaultItemLocator`, y hay tests de aislamiento obligatorios por `ADR-004`. La clave envuelta añadió su propio test de aislamiento (#82) |
| El vaciado del portapapeles no ocurre sin https | `Aceptado, con premisa caducada` | `execCommand` exige un gesto del usuario, así que en contexto no seguro no puede vaciar, y la interfaz dejó de prometerlo en vez de fingirlo. **En el entorno local ya no aplica**: desde #112 hay contexto seguro y `navigator.clipboard` existe. Sigue aplicando a quien despliegue por `http` en su red sin certificado. Que la interfaz volviera a prometer el vaciado donde sí puede cumplirlo **no hizo falta hacerlo**: se decide en tiempo de ejecución mirando `isSecureContext`, no el entorno, así que la promesa volvió sola al haber contexto seguro. Era la única deuda reconocida sin issue, y deja de serlo por no existir |
