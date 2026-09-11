ITERACIÓN 6 — Historial y lecciones aprendidas

Archivo de la Iteración 6, cerrada el 16 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que el repositorio dejó de tener afirmaciones que nadie podía comprobar. Si alguna vez hay que tocar el comprobador de identificadores, la lista de palabras inglesas, las comprobaciones de documentación del CI o la carga diferida de las rutas, merece la pena leer esto antes de investigar desde cero.

El objetivo era que lo que el repositorio afirma sobre sí mismo se pudiera comprobar ejecutando un comando. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


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


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 6: cerrada el 16 de agosto de 2026.** Objetivo cumplido: *lo que el repositorio afirma sobre sí mismo se puede comprobar ejecutando un comando.*

Catorce issues cerrados, tres de ellos abiertos por el camino: #195, la séptima capa del renombrado que ningún inventario había visto; #197, el hueco de gramática del comprobador; y #202, que `ExportDialog` no tiene ninguna cobertura.

**Lo que cambió de fondo:** las afirmaciones del repositorio sobre sí mismo dejaron de ser prosa. Había tres cifras del inventario de identificadores en español y ninguna coincidía —101, 103 y 105—; al medir con el analizador real de cada lenguaje eran **240 en producción y 256 en los tests**, y al cerrar son **cero y cero** en las seis áreas. Y no se cerró afirmándolo: se cierra con `./scripts/check-identifiers.py --all`, que cualquiera puede ejecutar.

**La lección que la abrió, y que es la tercera vuelta del mismo fallo.** La Iteración 4 dio por cumplido un criterio sin ejecutarlo. La 5 lo rectificó y decidió que un criterio comprobable con un comando **es** ese comando. Al planificar la 6 apareció que ese comando no existía: `ITERACION_5.md` afirmaba que «existe y funciona» y no estaba en ninguna parte. **Escribir la mitigación no es aplicarla.**

**Lo que se construyó para que no haya una cuarta vuelta:** `check-identifiers.py` con sus extractores por AST, `check-docs.py` con las comprobaciones de documentación, `dump-ui-text.mjs` para comparar el texto visible antes y después de un renombrado, 52 tests del propio utillaje, y el workflow `repositorio` que ejecuta todo en cada PR — con dos jobs que corren **siempre y sin filtro de paths**, porque el problema nunca fue que faltaran checks sino que su ausencia no significaba nada.

Y el bundle, que llevaba tres iteraciones fuera: las rutas se cargan de forma diferida y la pantalla de registro aparece en **4.295 ms en vez de 8.820** con Slow 3G y caché fría.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_6.md`. La que más se repite, y ya con nombre propio: **un punto ciego no se ve desde dentro de la herramienta que lo tiene** — al extractor le faltaban los accessors, y `check-docs.py` no se veía a sí mismo hasta que llegó a CI.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 6, cerrada

Nueve criterios. **Los nueve cumplidos**, y ninguno dado por bueno leyendo código: cada uno se evaluó ejecutándolo el día del cierre.

1. ✅ **Cero alertas de Dependabot abiertas en `master`**, comprobado en el panel. Al evaluarlo había **una** abierta —`nanoid`, publicada ese mismo día y posterior a #193—, y se arregló en el PR de cierre en vez de declarar el criterio cumplido con una alerta viva. Conviene saber que este criterio mide un estado del mundo y no del repositorio: es un blanco móvil (#193).
2. ✅ **El comprobador está en el repositorio y se ejecuta con un comando.** Verificado ejecutándolo, y con el test que planta un identificador en un fichero con un byte NUL y comprueba que lo ve (#189).
3. ✅ **Cero identificadores en español en el código de producción.** 0 de 909 en `web`, 0 de 364 en `api`, 0 de 211 en `scripts`, 0 de 12 en los workflows (#160, #178–#183, #195).
4. ✅ **Cero en los ficheros de test.** 0 de 422 en `web`, 0 de 177 en `api`. Los textos de `it` y `describe` siguen en español, y las 2.060 cadenas de los ficheros de test son idénticas a las de antes (#161).
5. ✅ **El texto visible de la interfaz es idéntico al de antes del renombrado.** Volcadas con el AST las **1.709 cadenas** del código de producción en el commit anterior a #178 y en el posterior a #183: idénticas, **cero quitadas y cero modificadas**. Las 14 que hay de más al cerrar son todas de #45.
6. ✅ **El job de documentación detecta cada caso roto a propósito.** Las seis comprobaciones verificadas con seis mutaciones, las seis detectadas (#62).
7. ✅ **La referencia rota de `vite.config.ts` está corregida.** Apuntaba a un documento de arquitectura que **nunca existió** —no hay ni un commit que lo añadiera—; ahora apunta a `src/lib/csp.ts` (#62).
8. ✅ **El chunk inicial baja de forma medible.** De **689,7 kB** en un solo chunk a **338 kB** de arranque; la ruta del login descarga 485,4 kB y la de la vault 657,5. Verificado en navegador con Slow 3G y caché fría contra el build anterior: la pantalla de registro aparece a los **4.295 ms** en vez de a los **8.820**, y el contenedor nunca estuvo vacío en 462 muestras (#45).
9. ✅ **Pest, Vitest, Larastan en nivel `max` y CI en verde.** 371 tests en la web —los 368 de antes del renombrado más 3 del fallback de rutas—, 238 en la API y 52 del utillaje, sin baseline.

Deuda que deja, con issue: **#197**, que el comprobador no ve los identificadores en orden español; y **#202**, que `ExportDialog` no tiene ninguna cobertura y ahí vive la confirmación del export en claro.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **El comprobador no ve la gramática** | `Mitigado en parte, y el resto es irreducible` | Mide vocabulario. `useVaultPersonal` son tres palabras inglesas en orden español y pasa. Costó **un hallazgo por capa** en el renombrado: `useVaultPersonal`, dos `aItem` distintos —uno en un fichero que el check reportaba limpio—, la propiedad `a` de `NavItem` y la de `link`, y el prop `pie`. Los cinco los encontró **leer** la lista de identificadores, no ejecutar el comando. #197 automatizó la parte que se podía —las palabras funcionales españolas pegadas a otra, como `aItem` o `deVault`— y dejó escrito que el resto seguiría necesitando ojos. Sigue siendo cierto: `useVaultPersonal` pasa |
| **Un punto ciego no se ve desde dentro de la herramienta que lo tiene** | `Materializado dos veces y cerrado` | Al extractor de TypeScript le faltaban `GetAccessor` y `SetAccessor`, así que tres getters en español de `lib/api.ts` llevaban meses pasando; apareció **leyendo** el fichero para renombrar otra cosa, y obligó a rectificar el recuento publicado en #189. Y `check-docs.py` usaba `git ls-files`, que solo ve el índice, de modo que **un fichero recién escrito era invisible para su propio comprobador**: en local decía «todo en orden» y en CI encontró cuatro problemas. Los dos corregidos y con test; lo que queda es la clase de fallo, que solo se cierra midiendo con dos herramientas distintas |
| **`ExportDialog` no tiene ninguna cobertura** | `Cerrado, y la clase de fallo sigue arriba` | Resuelto en #202: hoy está al 97,4 % de sentencias, medido. Lo que **no** se cerró es la clase de fallo, que tiene fila propia más arriba —«un módulo a cero es invisible cuando el total está bien»— y que volvió a materializarse dos veces en la planificación de la Iteración 7, porque #202 dio por cubiertos indirectamente unos módulos que estaban a cero. Detalle original: cero de 39 sentencias, cero de 22 ramas, cero de 11 funciones, medido. Ningún test lo importa. Lo que está sin cubrir no es pintado: es la confirmación del export en claro que `ADR-011` exige que no se pueda dar por inercia, y un export en claro sin esa puerta deja la vault entera legible en la carpeta de descargas. Va a #202, con la mutación concreta que los tests tienen que detectar |
| **La carga diferida introduce estados que antes no existían** | `Cerrado` | No se materializó, y el motivo es instructivo: en la carga en frío React suspende antes de confirmar el primer render, así que queda a la vista el marcador que `index.html` trae dentro de `root`; y al navegar, react-router usa una transición y React conserva la pantalla anterior. **El `RouteFallback` no llegó a verse ni una vez en el navegador**, y se queda igualmente con sus tres tests, porque una red que no se despliega casi nunca es la que falla el día que hace falta. Detalle original: #45 parte las rutas con `React.lazy`, y eso crea huecos de carga donde antes no había ninguno. El modo de fallo es una pantalla en blanco al navegar, que en build de desarrollo no se ve porque el chunk está caliente. Mitigación: el criterio de salida 8 exige comprobarlo **en navegador y no solo en build**, y #45 va el último para que si la iteración se alarga sea lo que se cae |
| **Una herramienta de auditoría omite ficheros en silencio** | `Materializado y cerrado, con secuela abierta` | Descubierto en la Iteración 5 y es el hallazgo que más lejos llega. `web/src/lib/vault/import.ts` contenía un byte NUL literal —usado como separador en `findDuplicates`, y la intención era correcta—, así que `file` lo clasificaba como `data` y **`grep` lo omitía sin dar error, sin avisar y sin contarlo**. Ninguna auditoría del repositorio había visto ese fichero desde que se creó el 4 de agosto, lo que explica que sobreviviera a la migración de #115 y a la evaluación del criterio 7. Corregido en #184. **Lo que queda abierto es la clase de fallo, no el caso**: un comprobador que omite en silencio devuelve un cero tranquilizador, y es peor que no tenerlo. Va a #62, que tendrá que usar `-a` y comprobar que ningún fichero de texto lleve bytes NUL |
| **Un criterio de salida se da por cumplido sin comprobarlo** | `Materializado, y con mitigación en curso` | Ya pasó: el criterio 7 de la Iteración 4 afirmaba que no quedaban identificadores en español y quedaban 25 en producción, detectado en #153 al día siguiente de cerrar la iteración. Lo que lo hace peligroso es que **el daño escala solo**: de un checkbox a `STATUS.md`, de ahí al archivo de la iteración y de ahí a un repositorio público, ganando autoridad en cada salto sin que nadie añada una comprobación. Un test que no detecta nada al menos pasa por delante de alguien; una afirmación en un criterio de salida no la vuelve a mirar nadie, porque el documento donde vive es el que certifica que ya está comprobado. Mitigación: **si un criterio se puede comprobar con un comando, el criterio es ese comando y se deja escrito en el repositorio** — va en #62, junto con las comprobaciones de documentación en los PR. **Tercera aparición, al planificar la Iteración 6, y esta vez en la propia mitigación**: `ITERACION_5.md` afirma que el comando de comprobación «existe y funciona» y que «queda en el repositorio», y no está en ninguna parte. Escribir la mitigación no es aplicarla. Va a #189, que la construye y la commitea antes de renombrar nada |
| Identificadores del código en dos idiomas | `Reabierto` | **Estuvo marcado `Cerrado` y no lo estaba**, porque se cerró contra #97 y #97 se cerró antes de tiempo: quedaban más de cien identificadores en español, no cero. Se corrige aquí al planificar la Iteración 6, donde se salda de verdad con #189, las seis capas #178–#183 y #161. Lo que sigue siendo cierto del texto original: el riesgo estaba donde se esperaba —en lo que no es un símbolo y por tanto el compilador no vigila: los campos del contrato, el store `evault.sesion` y las claves de `config/throttling.php`— y esa parte se respetó entera. Lo que sí se rompió fue el **texto de la interfaz cruzando saltos de línea**, que ninguna auditoría línea a línea detectó y que estuvo roto en `master` dos issues seguidos. Ver `ITERACION_4.md` |
| El bundle crece sin control | `Mitigado` | Resuelto en #45, y quedó fuera de las Iteraciones 4 y 5 con motivo las dos veces. Las rutas se cargan de forma diferida: el arranque baja de **689,7 kB en un solo chunk** a **338 kB**, y lo que descarga quien abre el login pasa a 485,4 kB. Lo que de verdad se nota, medido en navegador con Slow 3G y caché fría: la pantalla de registro aparece a los **4.295 ms** en vez de a los **8.820**. La ruta de la vault apenas mejora —657,5 kB— y no es un descuido: `AppLayout` necesita `@base-ui/react` para el menú de usuario, comprobado siguiendo el grafo de imports. Lo que sigue sin haber es un techo que falle el CI, y su propio issue lo dejó fuera a propósito: primero medir |
