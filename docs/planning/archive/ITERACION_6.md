ITERACIÓN 6 — Historial y lecciones aprendidas

Archivo de la Iteración 6, cerrada el 16 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que el repositorio dejó de tener afirmaciones que nadie podía comprobar. Si alguna vez hay que tocar el comprobador de identificadores, la lista de palabras inglesas, las comprobaciones de documentación del CI o la carga diferida de las rutas, merece la pena leer esto antes de investigar desde cero.

El objetivo era que lo que el repositorio afirma sobre sí mismo se pudiera comprobar ejecutando un comando. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Catorce issues cerrados, tres de ellos abiertos por el camino.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub.

Bloque cero, lo único que se veía mal desde fuera. El issue 193 saldó las siete alertas de Dependabot abiertas en master. Fue primero por el mismo criterio que puso al 153 primero en la Iteración 5: era lo único visible en un repositorio público y costaba poco.

Bloque uno, el comprobador. El issue 189 construyó ./scripts/check-identifiers.py, lo commiteó y publicó el recuento real antes de renombrar una sola línea.

Bloque dos, las siete capas del renombrado. Los issues 178 a 183 más el 195, encadenados para no competir por los mismos ficheros, bajo el paraguas del 160. Y el 161, los tests.

Bloque tres, el CI. El issue 62, con el workflow «repositorio» y sus dos jobs.

Bloque cuatro, el bundle. El issue 45, con las rutas cargándose de forma diferida.

Abiertos por el camino y que quedan vivos: el 195, la séptima capa que ningún inventario había visto; el 197, el hueco de gramática del comprobador; y el 202, que ExportDialog no tiene ninguna cobertura.


LA CIFRA, QUE ES LA HISTORIA DE LA ITERACIÓN

Antes de empezar circulaban tres números del inventario de identificadores en español, y no coincidían entre sí: ciento uno, ciento tres y ciento cinco. Al medir con el analizador real de cada lenguaje eran DOSCIENTOS CUARENTA en producción y DOSCIENTOS CINCUENTA Y SEIS en los tests. Al cerrar son cero y cero, en las seis áreas.

Y la primera cifra publicada, la del issue 189, también estaba corta: dijo doscientos treinta y ocho. Faltaban tres getters porque al extractor de TypeScript le faltaban GetAccessor y SetAccessor, y sobraba una clave persistida que no debía contarse. Se rectificó en el propio issue al descubrirlo.


CRITERIOS DE SALIDA, Y CÓMO SE VERIFICÓ CADA UNO

Eran nueve y se cumplieron los nueve. Ninguno se dio por bueno leyendo código.

Uno, cero alertas de Dependabot abiertas en master, comprobado en el panel. Al evaluar el criterio había UNA abierta, de nanoid, publicada ese mismo día y posterior al issue 193. Se arregló en el PR de cierre en vez de declarar el criterio cumplido con una alerta viva. Conviene saber que este criterio es un blanco móvil: mide un estado del mundo, no del repositorio.

Dos, el comprobador está en el repositorio y se ejecuta con un comando. Verificado ejecutándolo, y con el test que planta un identificador en un fichero con un byte NUL y comprueba que lo ve.

Tres y cuatro, cero identificadores en español en producción y en los tests. Cero de novecientos nueve en web, cero de trescientos sesenta y cuatro en api, cero de doscientos once en scripts, cero de doce en los workflows, cero de cuatrocientos veintidós en los tests de web y cero de ciento setenta y siete en los de api.

Cinco, el texto visible de la interfaz idéntico al de antes del renombrado. Volcadas con el AST las mil setecientas nueve cadenas visibles del código de producción en el commit anterior al issue 178 y en el posterior al 183: IDÉNTICAS, cero quitadas y cero modificadas. Las catorce que hay de más al cerrar son todas del issue 45.

Seis, el job de documentación detecta cada caso roto a propósito. Las seis comprobaciones verificadas con seis mutaciones, las seis detectadas.

Siete, la referencia rota de vite.config.ts corregida. Apuntaba a un documento de arquitectura que nunca existió; ahora apunta a src/lib/csp.ts, que es donde está la explicación de verdad.

Ocho, el chunk inicial baja de forma medible. De 689,7 kB en un solo chunk a 338 kB de arranque; lo que descarga quien abre el login pasa de 689,7 a 485,4 kB. Verificado en navegador con Slow 3G y caché fría, contra el build anterior: la pantalla de registro aparece a los 4.295 ms en vez de a los 8.820.

Nueve, Pest, Vitest, Larastan en nivel max y CI en verde. 371 tests en la web —los 368 de antes del renombrado más tres del fallback de rutas—, 238 en la API, 52 del utillaje, y análisis estático sin baseline.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

ESCRIBIR LA MITIGACIÓN NO ES APLICARLA. Es la lección que abrió la iteración. La Iteración 4 dio por cumplido un criterio sin ejecutarlo. La 5 lo rectificó y decidió que un criterio comprobable con un comando ES ese comando. Y al planificar la 6 apareció que ese comando no existía: el archivo de la Iteración 5 afirmaba que «existe y funciona» y no estaba en ninguna parte. Tres vueltas del mismo fallo, cada una un nivel más adentro.

UN HALLAZGO QUE NO SE PUEDE ARREGLAR ACABA ARREGLÁNDOSE MAL. El comprobador marcaba usuarioRecordado, que es la clave persistida antigua que el merge del store lee del localStorage de quien ya tenía sesión. Renombrarla no rompe la compilación: rompe la sesión guardada de la gente, en silencio. Mientras el check no llegue a cero, alguien terminará renombrándola para que pase. Por eso se excluyó con su motivo escrito, y no se dejó simplemente marcada.

UNA LISTA DE PERMITIDOS FALLA RUIDOSAMENTE; UNA DE PROHIBIDOS FALLA EN SILENCIO. Es la decisión de diseño del comprobador. Una lista de palabras españolas prohibidas deja pasar la que no esté escrita y nadie se entera. La lista de palabras inglesas permitidas reporta lo que no conoce, y meter una palabra española en un fichero llamado english.txt queda en el diff de un PR.

Y SU MODO DE FALLO PROPIO: ADMITIR UNA PALABRA ESPAÑOLA. Pasó dos veces, las dos por añadir en bloque la salida del comando sin leerla. La primera fue «pie», que entró pensando en pie chart y en el código es pie de página. La segunda fueron cinco de golpe —esta, llega, nunca, raiz, ya— que venían de identificadores recién escritos en un test. El test que protege la lista NO las detectó, porque comprueba tildes y eñes y las cinco son ASCII puro.

EL COMPROBADOR NO VE LA GRAMÁTICA, Y ESO CUESTA UN HALLAZGO POR CAPA. Mide vocabulario. Se le escaparon useVaultPersonal, dos aItem distintos —uno en un fichero que reportaba limpio—, la propiedad «a» de NavItem y la de link, y el prop «pie». Los cinco los encontró LEER la lista de identificadores, no ejecutar el comando. Queda en el issue 197 la parte automatizable, y queda dicho que useVaultPersonal seguirá necesitando ojos.

UN PUNTO CIEGO NO SE VE DESDE DENTRO DE LA HERRAMIENTA QUE LO TIENE. Al extractor de TypeScript le faltaban los accessors, así que tres getters en español de lib/api.ts llevaban meses pasando. Apareció leyendo el fichero para renombrar otra cosa. Y check-docs.py usaba git ls-files, que solo ve el índice, de modo que un fichero recién escrito era invisible para su propio comprobador: en local decía «todo en orden» y en CI encontró cuatro problemas.

RENOMBRAR SOBRE EL AST Y NO SOBRE EL TEXTO. Un reemplazo por palabra rompe el JSX: «Se ha copiado el texto» contiene texto, y «Lo entiendo, descargar sin cifrar» contiene descargar. Tocando solo nodos Identifier, los literales y el texto JSX quedan intactos POR CONSTRUCCIÓN y no por cuidado. En PHP el equivalente es que las variables llevan dólar delante; en Python, tokenize.

UNA CLAVE DE OBJETO NO ES UNA VARIABLE. La primera pasada sobre los tests dejó 46 en rojo por renombrar nombre dentro de un fixture: ahí no es un identificador, es el contrato del blob. El renombrador pasó a saltar claves de objeto, miembros de interfaz y accesos a atributo.

UNA MUTACIÓN QUE NO SE APLICA SE PARECE MUCHO A UNA QUE NO SE DETECTA. Al comprobar la red de tests del aviso de Register, la primera mutación buscó la frase en minúscula y en el fichero empieza oración. El test pasó. De no haberlo comprobado, la conclusión habría sido que la red no servía.

DOS VOLCADOS VACÍOS DAN UN DIFF IDÉNTICO. Al evaluar el criterio cinco, la herramienta de comparación falló al resolver TypeScript y produjo dos ficheros vacíos; el diff dijo que eran iguales y el criterio pareció cumplido. Es el cero tranquilizador otra vez, dentro de la propia evaluación del criterio que existe para evitarlo. Cualquier comparación necesita una guarda que exija haber medido algo.

EL CAMINO QUE NADIE RECORRE SIGUE SIENDO EL QUE ESTÁ ROTO. Los dos jobs nuevos del issue 62 fallaron en su primer PR por tres motivos que en local no se pueden dar: clon superficial sin antepasado común, el comprobador que no se veía a sí mismo, y el check de identificadores marcando el código recién escrito porque no lo ejecuté antes de subir.

LA CARGA DIFERIDA NO DEJÓ NINGUNA PANTALLA EN BLANCO, Y NO POR EL FALLBACK. En la carga en frío React suspende antes de confirmar el primer render, así que queda a la vista el marcador que index.html trae dentro de root; y al navegar, react-router usa una transición y React conserva la pantalla anterior. El RouteFallback no llegó a verse ni una vez en el navegador. Se queda igualmente, porque un Suspense necesita fallback y poner null sí sería la pantalla en blanco, y tiene tres tests: una red que no se despliega casi nunca es la que falla el día que hace falta.

MEDIR EL CHUNK INICIAL NO ES MEDIR LO QUE DESCARGA UN USUARIO. El arranque bajó de 689,7 a 338 kB, que suena a la mitad, pero la ruta del login descarga 485,4 y la de la vault 657,5, porque AppLayout necesita base-ui para el menú de usuario. Lo que de verdad se nota es el tiempo: de 8.820 a 4.295 ms en Slow 3G.
