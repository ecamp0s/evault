ITERACIÓN 7 — Historial y lecciones aprendidas

Archivo de la Iteración 7, cerrada el 18 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que eVault dejó de ser un proyecto que funciona y pasó a ser la vault donde están las contraseñas de verdad. Si alguna vez hay que tocar la instancia personal, las copias de seguridad, el cambio de correo o el bloqueo por inactividad, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: hay 370 contraseñas reales dentro, cifradas, con copias que salen de la máquina y una actualización probada con vuelta atrás.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Dieciocho issues cerrados, seis de ellos abiertos por el camino y siendo buena parte del valor.

Bloque 0, las decisiones antes del código. El 214 planificó la iteración. El 215 fue ADR-013, que decidió dónde vive la instancia personal y en qué condiciones se opera. El 216 fue ADR-014, el cambio de correo electrónico.

Bloque 1, la fiabilidad que faltaba antes de meter contraseñas reales. El 217 y el 218 cubrieron masterPassword.ts y recovery.ts, que estaban a cero. El 219 puso un umbral de cobertura que falla el CI. El 220 hizo que la vault se bloquee sola por inactividad.

Bloque 2, el cambio de correo. El 221 en la API y el 222 en el cliente.

Bloque 3, la instancia. El 223 limpió los restos del despliegue de prueba, el 224 desplegó, el 225 sacó las copias de la máquina cifradas y el 226 probó la actualización con datos dentro.

Bloque 4, el punto de no retorno. El 227 migró las contraseñas reales y el 228 cerró.

Fuera de plan salieron el 230, el 232, el 246, el 251, el 255 y el 259.


LO QUE APARECIÓ MIDIENDO, Y NO ESTABA EN NINGÚN DOCUMENTO

La planificación destapó cinco cosas de la misma familia, y esa familia es la lección central de la iteración.

Los dos módulos que tocan el material que abre la vault tenían CERO cobertura. masterPassword.ts a cero de 40 líneas y recovery.ts a cero de 107, porque los tests de sus pantallas los sustituían con vi.spyOn. No se veía en el total, que estaba al 89,2 por ciento. Y el issue 202 había afirmado por escrito que masterPassword.ts estaba cubierto, usándolo como argumento para no auditar.

El generador de STATUS.md solo leía 100 issues. El repositorio tenía exactamente 100 al cerrar la Iteración 6, así que funcionaba por casualidad; al crear el issue 214 empezó a mentir, y no fallando sino informando de que el documento ya estaba al día.

ADR-012 sección 2.4 prometía un issue para verificar el hosting compartido. Ese issue no existe: nunca se creó.

Dos PR de Dependabot llevaban once y cuatro días abiertos sin que nada los reportara, porque STATUS.md solo lee issues. Se descubrieron porque alguien preguntó por dos números sueltos.

Y la mitad cliente de la mitigación de la rotación de contraseña estaba declarada Mitigado en STATUS.md sin un solo test.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

UNA AFIRMACIÓN EN UN DOCUMENTO QUE LE DA AUTORIDAD ES LA FORMA MÁS CARA DE ESTE FALLO. Las cinco de arriba son la misma cosa: algo plausible escrito en un sitio con autoridad, que nadie volvió a comprobar. Lo nuevo de esta iteración es dónde vivían dos de ellas: en un ADR y en un issue cerrado, que son precisamente los dos sitios que el proyecto trata como definitivos. Un ADR es inmutable por diseño, así que una afirmación falsa dentro de uno no se corrige: se hereda.

UNA MUTACIÓN QUE NO SE APLICA SE PARECE MUCHO A UNA QUE NO SE DETECTA, y esta vez pasó al revés y fue más engañoso. Al probar el script de copias con un destino roto, el script funcionó y subió la copia. Parecía que no detectaba el fallo; lo que ocurría es que el fallo no llegaba a producirse, porque el .env pisaba la variable del entorno. La conclusión cómoda habría sido que el script no servía.

LO QUE ARREGLA UN BUG NO ES SIEMPRE LA LÍNEA QUE UNO CREE. Al corregir la retención de copias se cambiaron dos cosas: el nombre de fichero, que pasó a llevar un número de secuencia, y la función de ordenación. Al mutar cada una por separado resultó que la ordenación casi no importaba: con la secuencia en el nombre, el sort() de antes habría bastado. Sin esa comprobación, el comentario del código habría atribuido la corrección a la línea equivocada y el siguiente que lo leyera habría protegido lo que no toca.

UN TEST QUE PASA CON Y SIN EL ARREGLO NO PROTEGE DE NADA. Al cubrir la fuga de avisos de sonner se escribió el test antes de subir la dependencia, y pasaba igual quitando el arreglo, porque la versión instalada no tenía el fallo. Era un cero tranquilizador dentro de la propia verificación. La subida de versión tuvo que ir en el mismo commit para que el test significara algo.

EL CAMINO QUE NADIE RECORRE SIGUE SIENDO EL QUE ESTÁ ROTO, y esta vez el que estaba roto era el de actualizar. DEPLOYMENT.md afirmaba que las migraciones se aplican solas al arrancar, y con el comando que daba no se aplican: el código va por volumen, así que un git pull no cambia la imagen, y sin cambio de imagen compose no recrea el contenedor. La migración de prueba se quedó pendiente con los contenedores tres horas arriba y sin un solo error, dejando código nuevo con esquema viejo.

VERIFICAR SOLO EL CAMINO QUE UNO ESPERA RECORRER FALLA TRES VECES DE TRES. Pasó con el typecheck, que no lo hacen ni vitest ni eslint sino npm run build. Pasó con la suite de la API, filtrada por los tests que se esperaba tocar cuando el que falló era otro. Y pasó al evaluar el criterio 8 de esta misma sección, donde se filtró la salida y se perdió el nombre del único test que falló.

UN ERROR QUE NO NOMBRA SU CAUSA MANDA A BUSCAR AL SITIO EQUIVOCADO, y salió tres veces. npm ci con un Node viejo instala sin protestar y revienta después dentro de jsdom. La contraseña de MySQL leída del .env con dólar y paréntesis la expande PowerShell en la máquina local y produce un Access denied que parece un problema de credenciales. Y age no encontrando la clave en el servidor parece que falte algo, cuando es la garantía del cifrado asimétrico funcionando.


LO QUE CAMBIÓ DE FONDO, Y NO ES CÓDIGO

La regla de idioma. Hasta el 17 de agosto la frontera entre español e inglés pasaba por dentro de cada fichero, y eso obligaba a vigilarla con 1.585 líneas de comprobador y una lista de 692 palabras. La observación que lo cambió fue de su autor y era correcta: con la frontera entre ficheros no hay nada que comprobar. Lo ya escrito se convierte en el issue 251, y el comprobador se retira con esa conversión y no antes.

Y la naturaleza de la máquina de despliegue. Hasta esta iteración cualquier fallo era reproducible; a partir del 18 de agosto hay 370 contraseñas que no están en ningún otro sitio. Eso es lo que la iteración entera venía preparando, y es la razón de que la migración fuera lo último y no lo primero.


LO QUE QUEDÓ FUERA, Y POR QUÉ

El acceso a la vault desde fuera de la red local, issue 229. Se dejó a propósito porque puede acabar resolviéndose con una instancia en hosting compartido en vez de con un túnel, y esa decisión no era de esta iteración. Queda con la diferencia entre Tailscale, Cloudflare, una VPN propia y el hosting compartido ya razonada según quién termina el TLS.

La conversión del código a inglés, issue 251, que es el trabajo que permite jubilar el comprobador.

El .npmrc con engine-strict se hizo, issue 255. El test intermitente que apareció al evaluar el criterio 8 quedó abierto en el 259, sin identificar.
