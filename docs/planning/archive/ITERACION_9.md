ITERACIÓN 9 — Historial y lecciones aprendidas

Archivo de la Iteración 9, cerrada el 19 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault dejó de servir solo dentro de casa, y aquella en la que más veces se descubrió que una conclusión escrita era falsa. Si alguna vez hay que tocar Tailscale, el frontal de Caddy, el bloqueo por inactividad o el comprobador de idioma, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: la vault se consulta desde fuera de casa desde el 19 de agosto, verificado desde un iPhone por datos móviles con el wifi apagado.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Quince issues cerrados, cinco de ellos abiertos por el camino. El plan tenía doce.

Bloque 0, la planificación. El 284.

Bloque 1, la decisión antes del código. El 285, ADR-015, que eligió Tailscale.

Bloque 2, la vault se usa desde fuera de casa. Creció de tres issues a cinco porque el 286 resultó no ser ejecutable: el 295 con ADR-016, el 296 que unificó el origen, y después el 286, el 287 y el 288. Con ellos se cerró la deuda 229.

Bloque 3, lo que llevaba dos iteraciones sin verificarse. El 281, que automatizó el bloqueo por inactividad; el 260, que quedó reducido al móvil; y el 289, la clave de recuperación sobre una vault real.

Bloque 4, la deuda que apareció al planificar. El 251 y el 291.

Fuera de plan salieron el 295, el 296, el 304 y el 305, más cuatro deudas nuevas: el 290, el 303, el 309 y el 305 antes de resolverse.


LO QUE CAMBIÓ DE FONDO

La vault se alcanza desde fuera de la red local sin abrir un puerto del router, con certificado de Let's Encrypt y sin instalar ninguna CA en el dispositivo. Eso cierra lo que ADR-013 registraba como el riesgo real al propósito número uno: mientras la vault solo sirviera en casa, se seguía usando el gestor anterior en paralelo.

Y dos cosas que no estaban planificadas y valen tanto como el objetivo. CORS desapareció del proyecto entero, porque la SPA y la API pasaron a compartir origen. Y el artefacto de la SPA dejó de estar atado a un hostname: un dist construido una vez sirve desde cualquier nombre, lo que además tumbó el motivo por el que ADR-012 había descartado publicar imágenes.


LA LECCIÓN QUE MÁS SE REPITIÓ, Y ESTA VEZ CONTRA UNO MISMO

Una afirmación escrita en un documento que le da autoridad y que nadie volvió a comprobar. Ocho veces en la planificación, y varias más durante la iteración. La vuelta nueva es que la mayoría no eran heredadas de documentos viejos: se escribieron durante esta misma iteración.

El issue de conversión a inglés no existía, aunque CLAUDE.md llevaba dos días diciendo que sí. Probar la clave de recuperación estaba en el SIGUIENTE PASO sin issue. El 229 pedía aplicar una corrección a ADR-012 que ADR-013 ya había hecho el mismo día que se escribió, y la planificación la copió sin comprobarla. ADR-015 decidió conservar dos caminos de acceso sin verificar que el frontal pudiera servirlos, y no podía. El issue 289 afirmaba que recovery_wrapped_key cambiaría al recuperar, y no cambia. Y la conclusión de que en headless no puede haber pestañas ocultas era una generalización a partir de una medición correcta, que dejó dos casos esperando a una persona durante dos iteraciones sin necesidad.

De todas ellas, la más instructiva es la de ADR-015, porque poner la decisión delante del código NO evitó el error: lo que hizo fue que apareciera en un documento y no en una máquina con 370 contraseñas dentro. Eso es lo que compra el método, y conviene no pedirle más.


UNA COMPROBACIÓN PUEDE PASAR O FALLAR POR EL MOTIVO EQUIVOCADO, CUATRO VECES

Todas en utillaje escrito durante esta iteración, y todas encontradas por mirar el resultado en vez de aceptarlo.

La guarda del guion de bloqueo anunciaba haber medido que las pestañas de fondo no se estrangulan, midiendo el efecto de un flag que el propio guion pasa a Chromium. isUnlocked comprobaba no estar en la pantalla de desbloqueo, y la de registro también cumple eso, así que un registro fallido parecía correcto. El caso 3 daba por bueno que el aviso hubiera desaparecido, cosa que también es cierta cuando la vault se ha bloqueado y ha desmontado el árbol. Y el comprobador de idioma salió verde con dos líneas en español recién escritas delante, porque comparaba contra HEAD y no contra el árbol de trabajo.

La regla que sale de aquí: una comprobación nueva necesita su mutación el mismo día. Las cuatro se encontraron aplicándola, ninguna leyendo el código.


LO QUE COSTÓ MÁS DE LO PREVISTO

El bloque 2. El 286 parecía instalación y configuración, y resultó que Tailscale da un solo nombre DNS por máquina mientras el despliegue usaba dos, y que la URL de la API se horneaba en el bundle. Eso obligó a un ADR nuevo y a un cambio de arquitectura del frontal antes de poder tocar la máquina. Dos issues y varias horas que no estaban en el plan, y el resultado es mejor que el plan.

El 305, que empezó como un intermitente sin causa y terminó siendo Chromium sin repintar pestañas ocultas: el toast estaba lógicamente descartado y visualmente congelado. Se resolvió bajando los umbrales del bloqueo sin tocar el reloj, lo que permitió pasar de un ciclo de dieciocho minutos a uno de treinta segundos y reproducirlo cuarenta y ocho veces.


LO QUE HAY QUE SABER ANTES DE TOCAR ESTO

Los nombres de máquina de una tailnet se publican en el registro público de Certificate Transparency, así que no pueden nombrar el proyecto. Está en ADR-015 sección 4 y aplica a cualquier máquina que se añada.

El certificado que emite la CA interna de Caddy dura DOCE HORAS, no meses. Se descubrió al escribir el aviso de caducidad, cuya primera versión usaba un umbral fijo de veintiún días y habría nacido en rojo. Por eso el margen de check-cert-expiry.sh es una fracción de la vida del certificado.

Con HTTPS, quien elige el sitio es el SNI y no la cabecera Host. Una petición a https://localhost con -H "Host: evault.local" falla en el handshake y devuelve 000, que parece el servidor caído estando perfectamente. Hay que usar --resolve.

Borrar config/cors.php NO retira CORS: Laravel cae en su valor por defecto, que es allowed_origins con comodín, y la API pasa a responder a cualquier origen. Lo que hay que quitar es el middleware HandleCors. Lo detectó el test que se escribió para verificar la retirada.

El guion de bloqueo registra cuatro cuentas por ejecución y la API permite diez por hora, así que dos ejecuciones seguidas agotan el límite y la tercera falla al arrancar con un mensaje que no se parece a un rate limit.

En Chromium headless SÍ hay pestañas ocultas: abrir una nueva oculta la anterior, aunque /json/activate y Page.bringToFront no lo hagan. Y una vez oculta se estrangula de verdad, hasta un tick por minuto a partir del sexto.


LOS CRITERIOS DE SALIDA

Ocho, y se dice el resultado tal cual salió. Siete cumplidos y uno que se cumplió a medias porque estaba mal escrito, cosa que se explica en vez de estirarse.

El cuarto pedía que recovery_wrapped_key cambiara al recuperar el acceso y que el ciphertext de los items no. La segunda mitad se cumplió, byte a byte. La primera NO, y hace bien: el envoltorio de recuperación cuelga de la clave de vault y no de la maestra, así que recuperar, que es una rotación, no lo toca. El criterio lo escribió quien planificó la iteración sin comprobarlo contra ADR-010. De ahí salió el 309.


LO QUE QUEDA ABIERTO

Cuatro deudas, tres de ellas encontradas en esta iteración. El 290, convertir a inglés los comentarios y nombres de test, que es la más grande y ahora tiene issue y red. El 303, que el bloqueo por inactividad descarta lo escrito en un diálogo sin avisar. El 309, que usar la clave de recuperación no la invalida y nada lo advierte. Y del móvil solo queda lo que ningún navegador de escritorio reproduce.

El hosting compartido queda pospuesto con sus señales de reevaluación escritas, no olvidado. Y el cabo de ADR-012 sección 2.4 —la promesa de un issue de verificación que nunca existió— se cierra aquí: con el hosting descartado como vía de acceso en ADR-015, esa verificación pierde demanda y deja de estar pendiente.
