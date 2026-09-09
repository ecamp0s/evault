ITERACIÓN 15 — Historial y lecciones aprendidas

Archivo de la Iteración 15, cerrada el 9 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault dejó de guardar solo contraseñas, y también aquella en la que la mitad de los hallazgos no vinieron del objetivo sino de mirar lo que ya estaba: una regla de idioma que fabricaba deuda en vez de evitarla, un verificador de despliegue que comprobaba el 0,85 por ciento de los datos, y una funcionalidad entera que nadie usaba porque nadie había preguntado si se entendía.

El objetivo se cumplió: se guardan tarjetas y notas seguras, y hay dos de verdad en la vault de verdad.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Veinticuatro issues cerrados sobre un plan de dieciséis. Los ocho de más aparecieron por el camino, y quedan tres abiertos que son deuda anotada.

Bloque 0, la decisión: el 503, que registró ADR-020.
Bloque 1, el modelo: el 504 el tipo y los campos en el blob, el 505 la validación por tamaño, el 506 el guardado.
Bloque 2, el editor: el 507 el selector de tipo, el 508 los campos de la tarjeta, el 509 la nota.
Bloque 3, la lista: el 510 el tipo de un vistazo y el 511 el botón de copiar.
Bloque 4, el resto: el 512 la búsqueda, el 513 el export, el 514 el import y el 515 la auditoría.
Bloque 5, la verificación: el 516 la vault sembrada y el 517 la tarjeta real.
Bloque 6, el cierre: el 518.

Y fuera de plan: el 534, el 535, el 538, el 542, el 543, el 544 y el 545, cerrados; más el 531, el 546 y el 550, que quedan abiertos como deuda.

ADR-020 es el que decide la iteración: tipo dentro del blob, ausente significa login, cinco campos de tarjeta, la tarjeta acotada por tamaño y no validada por forma, y los documentos adjuntos fuera con el argumento medido. Se escribió primero y solo, como ADR-015 en la 9 y ADR-017 en la 13, porque una clave escrita dentro de un item no se renombra nunca.

Esa última frase dejó de ser cierta ocho días después, dentro de la misma iteración, y así es como pasó.


LOS CRITERIOS DE SALIDA

Ocho, escritos al abrir el 8 de septiembre de 2026. Cinco cumplidos, uno a medias, uno cumplido y después deliberadamente deshecho, y uno retirado. Se dice así en vez de estirar la definición.

El 1, una tarjeta real en la vault real leída desde el móvil: CUMPLIDO. Una American Express con sus cinco campos, guardada en kastor y leída desde el iPhone con la aplicación instalada (#517).

El 2, una nota segura real: CUMPLIDO, lo mismo (#517).

El 3, las 370 entradas anteriores se abren sin haberlas tocado: CUMPLIDO, Y DESPUÉS DESHECHO A PROPÓSITO. Se comprobó al crear la tarjeta sobre la vault real, con las 639 entradas de entonces abriéndose igual. Y después la propia iteración las borró: el 544 vació la instancia para que el renombrado de los campos no necesitara migración. El criterio se cumplió mientras existió su objeto, y decirlo de otra forma sería maquillarlo.

El 4, api sin un solo cambio: CUMPLIDO, y medido con precisión. Desde el commit que abre la iteración hasta el cierre, git diff sobre api sale vacío. El único cambio del rango más amplio es un composer.lock de Dependabot mergeado ANTES de abrirla.

El 5, la auditoría no cuenta tarjetas ni notas y el recuento vuelto a leer: A MEDIAS. La primera mitad está hecha y comprobada por mutación. La segunda NO, y ya no se puede: el 246 de 369 se refería a una vault que se borró. No es una tarea pendiente, es una medida sin objeto.

El 6, el número de la tarjeta no aparece en el DOM de la lista: CUMPLIDO, con test, igual que la contraseña (#510).

El 7, los ocho límites de verify-large-vault en verde con los tres tipos: CUMPLIDO, sobre 370 entradas y en la ejecución completa, no en la corta. La revisión marcó 205 de 308 (#516).

El 8, alguien que no construyó la pantalla crea una tarjeta sin explicaciones: RETIRADO EL 9 DE SEPTIEMBRE, y el motivo importa más que el criterio. Pedía involucrar a la segunda persona de la instancia, que no es una probadora: tiene cuenta porque se le ofreció la aplicación, no porque la pidiera. ADR-018 ya había decidido que el rigor debe ser proporcionado a una instancia personal, y el archivo de la Iteración 14 ya anotaba que NO QUEDAN LECTORES EN FRÍO AQUÍ. El criterio pedía exactamente lo que el proyecto tenía escrito como agotado, y lo escribió quien planificó sin releer aquello. Se sustituyó por el juicio de quien usa la vault, que confirmó lo que el criterio medía: la etiqueta del código de seguridad le llevó al anverso de una Amex y metió los cuatro dígitos sin que nadie se lo dijera.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 922 en la web (64 ficheros), 263 en la API (2.720 aserciones) y 105 del utillaje. Son 1.290, contra los 1.191 del cierre de la 14.
Cobertura: 95,31 por ciento global y 98,71 en lib/vault, con las funciones de lib/vault al 100.
Issues abiertos al cerrar: tres, y los tres son deuda: el 531, el 546 y el 550. PRs abiertos: cero.
Alertas de Dependabot ABIERTAS: cero.
ADR: veinte, uno nuevo, el 020.
Instancia: vaciada y reconstruida. Un usuario, una vault, cero items al cerrar, con la clave de recuperación configurada.
Y el recuento de la auditoría ya no existe: se fue con la vault que medía.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Diez issues, y esta vez el patrón cambia: los de las iteraciones anteriores salían de usar la aplicación o de desplegar. Aquí la mitad salió de MIRAR LO QUE YA ESTABA ESCRITO Y COMPROBAR SI SEGUÍA SIENDO VERDAD.

El 542 salió de que la lista de excepciones de la regla de idioma tenía cinco entradas y tres eran falsas, una de ellas desde siempre: la clave del state de react-router nunca estuvo en español. Y lo que las hacía dañinas no era estar obsoletas sino que FABRICABAN ESPAÑOL NUEVO — tipo, titular, numero y caducidad nacieron en español el 8 de septiembre porque la lista decía que los campos del blob van en español. Un día antes de que se retirara.

El 543 y el 544 salieron de ahí: renombrar los nueve campos, y vaciar la instancia para no tener que migrarlos.

El 538 salió de que un número no cuadraba al desplegar: se habían añadido dos entradas y la huella de verificación salió idéntica. GROUP_CONCAT trunca a group_concat_max_len, que vale 1024, así que la huella cubría 1.024 de 120.300 bytes. El comando que DEPLOYMENT.md proponía para comprobar que un despliegue no se había llevado nada verificaba el 0,85 por ciento de los datos, y la sección afirmaba que era «lo que de verdad prueba que los datos están iguales».

El 534 y el 535 salieron de usar la aplicación con una tarjeta de verdad: el número oculto estorbaba y la caducidad pedía una barra a mano.

El 545 salió de preguntar. El 546 y el 550, de intentar dejar los dispositivos limpios para el reset. Y el 531, de comprobar qué hace el import con nuestro propio CSV en claro.


LAS LECCIONES

LA MUTACIÓN ENCONTRÓ LO QUE LA SUITE NO, CINCO VECES. Y no en el código: en los tests. Un test que comprobaba PRESERVED_FIELDS pasaba igual con la decisión invertida. Otro afirmaba un atributo rows que field-sizing-content ignora, así que iba verde sobre un cambio que no cambiaba nada. Otro sobre el portapapeles dejaba pasar copiar sin limpiarlo. Otro sobre un hueco vacío miraba textContent, que un span vacío no llena. Y otro tecleaba 09/2024 carácter a carácter, donde una máscara golosa acaba en el mismo sitio. Los cinco los escribí para proteger una propiedad y ninguno la protegía. La suite no lo dice; mutar el código sí.

UN COMPROBADOR SE COMPRUEBA ANTES DE CREERLE, y esta vez el roto era el del despliegue. La huella de GROUP_CONCAT es la misma familia que el PerformanceObserver de largeVault.mjs y el grep sin -a del 184: un número tranquilizador que no mide lo que dice. Lo delató que dos entradas nuevas no movieran la huella. Ahora el comando imprime la longitud al lado, que es lo que lo habría delatado a la primera.

UNA LISTA DE «NO TOCAR» SE CONVIERTE EN UNA INSTRUCCIÓN DE «CÓMO NOMBRAR». La de CLAUDE.md estaba escrita como memoria de por qué ciertas cosas no se renombran, y acabó dictando el idioma de los campos nuevos. Tres de sus cinco entradas eran falsas y nadie lo había comprobado en meses. De ahí la regla nueva: si una excepción deja de ser cierta, se borra el mismo día.

Y LA VARIANTE DE ESO QUE MÁS CARO SALIÓ: la dificultad se había convertido en prohibición. Renombrar un campo del blob es caro —el servidor no puede convertir lo que no puede leer— y de ahí se había deducido que no se podía. Se podía: con una migración en el cliente o con una base vacía. Lo que faltaba en la lista no era el motivo sino LA SALIDA.

UNA FUNCIONALIDAD PUEDE ESTAR CORRECTA Y NO SERVIRLE A NADIE. El segundo factor tiene ADR propio, 50 tests contra los vectores del RFC 6238 y un caso de verify-auto-lock con recibo. Y llevaba sin usarse desde que existe, porque el texto explicaba CÓMO rellenar el campo y nunca QUÉ era. Ningún test lo detecta, ninguna revisión de código lo detecta: solo lo dice quien la iba a usar, y solo si se le pregunta. Se explicó, y la respuesta fue que ahora se entiende y aun así no se quiere — que es la primera vez que se puede distinguir eso de «no se lo han explicado».

EL RIGOR TIENE QUE SER PROPORCIONADO, Y ESTA VEZ LO ROMPIÓ LA PLANIFICACIÓN. El criterio 8 pedía un protocolo de prueba con una segunda persona, para una instancia personal de dos cuentas donde una de ellas no pidió estar. ADR-018 ya lo había decidido y la Iteración 14 ya lo había anotado como agotado. La lección no es sobre pruebas con usuarios: es que planificar sin releer lo que el propio proyecto decidió produce exigencias que contradicen sus decisiones.

Y EL CIERRE ENCONTRÓ ALGO QUE NADIE MÁS PODÍA ENCONTRAR, que es la razón de que los verificadores se ejecuten el día del cierre y no se hereden. Al correr verify-auto-lock salieron TRES DE OCHO CASOS EN ROJO, y no por el bloqueo: los tres decían «timed out waiting for: the new entry dialog». El renombrado del 543 había cambiado el id del campo de notas, y scripts/browser/vault.mjs esperaba a #notas en cuatro sitios. El CI NO ejecuta esos verificadores —a propósito, porque conducen un navegador de verdad y un check intermitente se acaba ignorando entero, que es la lección del 62—, así que nada lo habría dicho.

Y hubo un segundo tramo del mismo hallazgo, más silencioso: verify-large-vault había salido en verde el mismo día, en el 516, PERO ANTES DEL RENOMBRADO. Citar aquella ejecución al cerrar habría sido heredar una medida caducada de horas. Se volvió a ejecutar después del renombrado, y ahí sí valía.

Arreglados los cuatro selectores, los dos verificadores quedaron en verde el día del cierre: verify-auto-lock con OCHO DE OCHO casos en 18,3 minutos de reloj real —incluido el caso 9 con su recibo dentro: el código TOTP pasó de 615627 a 949554 sin que nadie lo tocara y la vault se bloqueó igual a los 15,8 minutos— y verify-large-vault con sus ocho límites sobre 370 entradas, con la revisión marcando 205 de 308.

Y UNA DE HERRAMIENTA, PORQUE SE PAGÓ ENTERA: un renombrado se verifica comparando el texto visible, no leyendo el diff. El compilador quedó limpio y los 922 tests en verde con CINCO frases españolas rotas dentro. Una de ellas estaba partida por una interpolación en JSX, con la palabra sola en su línea, así que ninguna auditoría línea a línea la habría visto. Es exactamente el fallo del 115, y ui-text.mjs existe por él.
