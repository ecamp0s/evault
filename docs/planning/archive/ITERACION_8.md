ITERACIÓN 8 — Historial y lecciones aprendidas

Archivo de la Iteración 8, cerrada el 18 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que lo que guarda las contraseñas dejó de funcionar por fe y pasó a estar comprobado. Si alguna vez hay que restaurar una copia, rotar la contraseña maestra o entender por qué la suite se pone en rojo sin motivo aparente, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: se restauró una copia con las 370 contraseñas reales y se abrió la vault desde ella, y la contraseña maestra se rotó sobre la instancia de verdad en dos segundos.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Ocho issues cerrados, tres de ellos abiertos por el camino.

Bloque 0, la planificación. El 262.

Bloque 1, que el verde volviera a significar algo. El 259, el test intermitente, que hubo que arreglar DOS VECES y lo pilló el propio criterio de salida.

Bloque 2, que las copias demostraran que sirven. El 263, que el backup subía copias vacías sin protestar. El 264, que su registro vivía en /tmp. El 265, que una noche sin copia no producía ningún efecto visible.

Bloque 3, verificar sobre los datos reales. El 266, restaurar una copia con las 370 contraseñas. El 267, rotar la contraseña maestra sobre la instancia real.

Fuera de plan salieron el 276, el 277 y el 281.


LO QUE APARECIÓ MIDIENDO, Y NO ESTABA EN NINGÚN DOCUMENTO

El backup subía copias vacías sin protestar. En el destino remoto había ocho copias: siete de 2.378 bytes, que son la vault vacía, y una de 210.855 con las contraseñas dentro. El guion comprobaba cuatro cosas y ninguna miraba si la copia contenía algo. Con treinta copias de retención y un cron diario, un vaciado que nadie notara en treinta días habría rotado las treinta buenas y dejado treinta copias de nada, todas correctamente cifradas y correctamente subidas.

El registro del backup vivía en /tmp, en una máquina que ADR-013 decide apagar a propósito. Se comprobó de la peor manera y a la vez de la mejor: el primer reinicio del día se llevó el registro entero, con la copia del cron de la madrugada y la manual de las diez y media dentro.

El intermitente del 259 no era ninguno de los tres candidatos que el issue listaba. Era el timeout de Vitest sin configurar, o sea cinco segundos, contra un test que tarda 916 milisegundos en máquina ociosa y 2.643 con carga.

Y el 276, que es el hallazgo que más pesa y el que más cerca estuvo de costar datos: compose.yaml fijaba name: evault DENTRO del propio fichero, así que era el mismo en cualquier clon. Un segundo clon en la misma máquina se apropiaba de los contenedores y volúmenes del primero, y un down -v desde él se habría llevado las 370 contraseñas sin que nada avisara.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

LA INFORMACIÓN QUE DETECTARÍA EL PROBLEMA SE PRODUCE Y SE DESCARTA, y esta iteración lo vio dos veces en el mismo repositorio. BackupCommand calcula las filas copiadas y las imprime, y offsite-backup.sh lo invocaba con mayor que dev null. Es palabra por palabra el fallo que dejó al 259 sin identificar durante una iteración entera, cuando se filtró la salida de la suite y se perdió el nombre del único test que falló. Dos meses de diferencia, misma forma.

UNA EXPLICACIÓN QUE ENCAJA CON EL SÍNTOMA NO ES UN DIAGNÓSTICO. La planificación afirmó que los ocho ficheros del intermitente derivaban claves con PBKDF2 sin sustituir. Encajaba: eran lentos, eran de criptografía, el proyecto tiene fama de eso. Era falso, y bastaba abrir el helper que usan para verlo, porque su comentario dice que importa 32 bytes justamente para NO derivar. Se publicó en un issue, en STATUS.md y en el puente antes de que nadie abriera el fichero.

UN NULL NO ES UNA RESPUESTA: PUEDE SER UNA PREGUNTA MAL HECHA. Se consultó User::first()->recovery_wrapped_key, salió null y se abrió el 277 afirmando que la instancia real no tenía clave de recuperación. Esa columna está en vault_members, y Eloquent devuelve null para un atributo inexistente SIN dar ningún error. La clave estaba desde antes, y lo demostraban las propias copias. El issue no encontró un agujero: lo abrió unos minutos —la clave vieja quedó invalidada al generar otra— y lo cerró.

MUTAR CADA CAMBIO POR SEPARADO, PORQUE EL QUE ARREGLA NO ES SIEMPRE EL QUE UNO CREE. El arreglo del 259 tenía tres piezas y parecían las tres necesarias. Mutándolas una a una resultó que subir el timeout de Testing Library no arreglaba nada: revertirlo deja la suite en verde treinta pasadas de treinta. Quien lo hubiera dado por bueno habría escrito en el código que las tres corrigen, y el siguiente en leerlo habría protegido la línea que no toca. Es la misma lección que el 240 dejó en la iteración anterior.

UN NÚMERO MEDIDO EN CONDICIONES QUE NO SON LAS REALES ES UNA SUPOSICIÓN CON DECIMALES, y esta costó arreglar el mismo issue dos veces. El timeout del 259 se fijó en quince segundos midiendo el test más lento CORRIENDO SOLO SU FICHERO: 916 milisegundos. Pero un test aislado no compite con los otros cuarenta ficheros de la suite, y el mismo test dentro de una pasada completa tarda 2.242. El margen real era 6,7 veces y no las 16 que aparentaba, así que bajo carga volvió a caer — esta vez el test de desbloqueo, que es el único que deriva con PBKDF2 de verdad. Encima el número se había elegido mirando el más lento DE LOS QUE FALLABAN y no el más lento de la suite, de modo que subir el techo no arregló el problema: movió el cuello de botella. Lo encontró el criterio de salida al ejecutarlo, que es justamente para lo que están.

UNA PRUEBA PUEDE COINCIDIR CON EL CÓDIGO POR EL MOTIVO EQUIVOCADO, que es la peor manera de tener razón. Al verificar el aviso de copias en kastor se forzó la ventana a cero días para que la copia contara como vieja; con ventana cero cualquier uptime la supera, así que las dos ramas cayeron por la del cron roto. La prueba decía lo que se esperaba oír sin comprobar nada.

UNA HERRAMIENTA DE VERIFICACIÓN QUE ENSUCIA PRODUCCIÓN NO SE USA. Ensayar ese mismo aviso escribía avisos inventados en el registro de la instancia, porque el log seguía apuntando al de verdad. Hubo que limpiarlo a mano dos veces, y la segunda dejó claro que no era un descuido sino un defecto: si probar algo cuesta ensuciar el sitio donde se mira, no se prueba.

EL PELIGRO APARECE JUSTO CUANDO SE VERIFICA LO CONTRARIO. El 276 no se encontró auditando el Compose: se encontró montando la instancia de restauración que pedía el 266. Es decir, el issue que existe para comprobar que las copias sirven fue el que topó con la forma de destruirlas.

UN CRITERIO QUE CUESTA UNA HORA DE RELOJ SE POSPONE SIEMPRE. El bloqueo por inactividad en navegador lleva dos iteraciones sin verificarse, y no por dificultad técnica: exige cuatro esperas de quince minutos delante de una pantalla. Se saca a utillaje en el 281, con una condición que no se puede negociar — quince minutos reales y estrangulamiento real, porque falsear el reloj reproduce lo que los tests ya cubren.


LO QUE CAMBIÓ DE FONDO, Y NO ES CÓDIGO

Las copias dejaron de ser un acto de fe. Antes de esta iteración existían, salían de la máquina y estaban cifradas, y nadie había abierto una vault desde ninguna. Ahora se restauró una con las 370 contraseñas dentro en una instancia limpia y se leyeron items descifrados en un navegador. El procedimiento entero está escrito en la sección 7 de DEPLOYMENT.md, con las tres cosas que costaron tiempo: que no hace falta descifrar nada, que la ruta dentro del contenedor no lleva api delante, y el aviso del nombre de proyecto.

Y ADR-008 dejó de ser un argumento para pasar a ser una medición. Rotar la contraseña maestra sobre 370 contraseñas reales tardó DOS SEGUNDOS, y las huellas tomadas antes y después lo explican: cambiaron password y wrapped_key, y el ciphertext de los items quedó idéntico byte a byte. La contraseña maestra no cifra los items, solo envuelve una clave de vault de 256 bits, así que rotar reenvuelve 32 bytes. Con la consecuencia que más se malinterpreta ya confirmada sobre datos reales: recovery_wrapped_key tampoco cambió, de modo que rotar NO invalida la clave de recuperación.


LO QUE QUEDÓ FUERA, Y POR QUÉ

El bloqueo por inactividad verificado en navegador, issue 260, por segunda iteración consecutiva. Hay una observación de uso real —su autor vio la vault bloquearse sola y tuvo que volver a escribir la contraseña maestra— y eso confirma que el mecanismo dispara fuera de los tests, pero sin horas apuntadas no es una verificación y se dice en vez de estirarlo. La salida es el 281, automatizarlo.

La conversión del código a inglés, issue 251, que abre la Iteración 9 con el volumen ya corregido: 805 nombres de test y unas 3.870 líneas de comentario en 214 ficheros, no los 547 que decía el issue.

Y el acceso a la vault desde fuera de la red local, issue 229, con el mismo criterio con que se dejó fuera de la 7.
