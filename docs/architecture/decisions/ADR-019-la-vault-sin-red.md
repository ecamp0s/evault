# eVault — La vault sin red

Fecha de decisión: 2026-09-02
Fecha de registro: 2026-09-02
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-007 (token de sesión en memoria), ADR-008 (arquitectura de claves), ADR-012 (estrategia de despliegue), ADR-013 (operación de la instancia personal), ADR-016 (un solo origen)

## 1) Contexto

Hoy, si kastor no responde, **no hay vault**. Ni siquiera para leer una contraseña que
se consultó hace diez minutos.

Y desde el 26 de agosto de 2026 eso ya no le pasa solo a quien administra la máquina:
la instancia tiene **dos cuentas reales**, cada una con su vault. La segunda persona
no puede diagnosticar por qué kastor no contesta ni arreglarlo; lo único que observa
es que la aplicación no funciona.

`ADR-013` §6 vigila tres señales para decidir si la instancia se muda a un hosting
compartido, y la primera es literalmente cuántas veces no se pudo consultar la vault
por estar kastor apagado. Este documento no responde esa pregunta: **la desactiva en
parte**, y conviene decirlo porque cambia el valor de una señal que se está midiendo.

### El dato que abarata todo esto

**Desbloquear sin red no necesita servidor en absoluto.**

Por `ADR-008`, el hash de autenticación solo sirve para conseguir un token, y el token
solo sirve para traer el ciphertext. Si el ciphertext ya está en el dispositivo, no
queda nada que pedirle a nadie: se deriva la clave maestra de la contraseña y el
correo, se desenvuelve la clave de vault y se descifra. Todo local, con el mismo
código que ya corre.

Y no hace falta un verificador de contraseña aparte: una contraseña incorrecta produce
una clave incorrecta, y AES-GCM falla al comprobar su tag. El error ya existe.

### Lo que ya está resuelto y no hay que rehacer

`ADR-012` hizo de HTTPS un requisito de arranque porque `crypto.subtle` no existe en
contexto inseguro. Un service worker exige exactamente lo mismo, así que **la
condición ya se cumple** en los dos nombres por los que se llega a la instancia.

## 2) Lo único caro de deshacer: el ciphertext en el dispositivo

Hoy en el dispositivo no se persiste nada del contenido. `evault.sesion` guarda un
nombre y un correo para rellenar el formulario, y se acabó. Cachear la vault pone los
blobs cifrados en el disco de un portátil y de un móvil.

**Qué no cambia**: quién puede leerlos. Siguen exigiendo la contraseña maestra, con el
mismo AES-256-GCM y las mismas 600.000 iteraciones de PBKDF2 dentro y fuera de kastor.

**Qué sí cambia**: dónde están. Pasan de vivir en una máquina de casa detrás de
Tailscale a vivir además en cada dispositivo que abrió la vault. Un portátil robado
lleva encima la vault cifrada.

**Y qué desaparece**: el rate limiting como defensa. Adivinar la contraseña maestra
contra kastor pasa por la API y su limitador; contra un caché local no pasa por nada,
y el atacante prueba a la velocidad de su máquina.

Eso último es lo que hay que aceptar en voz alta. La mitigación es que **el proyecto ya
aceptó exactamente esta propiedad en la Iteración 4**: un fichero `.evault` exportado
tiene la misma forma —ciphertext en un disco, sin limitador delante— y las 600.000
iteraciones se dimensionaron para eso. Lo que cambia es la frecuencia, no la
naturaleza: antes ocurría cuando alguien exportaba, ahora ocurre en cada dispositivo
que active la opción.

## 3) Opciones evaluadas

**Opción A (elegida): caché de solo lectura, opt-in por dispositivo.** Se guarda lo
que hace falta para leer y descifrar; escribir exige red. Apagado por defecto, para que
el dispositivo prestado o el navegador de un ordenador ajeno no acaben con una copia.

**Opción B (descartada): offline completo, con escritura y cola de sincronización.** Dos
dispositivos editando la misma entrada sin red producen un conflicto, y **el servidor no
puede resolverlo**: no puede leer el contenido, así que ni siquiera puede saber que los
cambios son incompatibles. La resolución tendría que hacerla una persona, entrada por
entrada, en una pantalla que hay que construir. Es más trabajo que esta iteración
entera, y el beneficio es marginal: consultar sin red es lo frecuente, editar sin red
casi nunca.

**Opción C (descartada): dejarlo como está.** Es lo de hoy, y lo que descarta la opción
no es la comodidad sino quién la paga: la segunda cuenta, que no puede hacer nada
cuando kastor calla.

## 4) Decisión final

| Elemento | Definición |
|---|---|
| Caché offline | **Sí, solo lectura** |
| Activación | **Opt-in por dispositivo**, apagado por defecto |
| Qué se guarda | `ciphertext` e `iv` tal como llegan, y la clave de vault envuelta |
| Dónde | IndexedDB |
| Alcance | **Por cuenta.** Entrar con otra cuenta no ve el caché de la primera |
| Se borra | Al cerrar sesión, al desactivar la opción, y al fallar la autenticación |
| Escribir sin red | **No.** Se avisa y se impide; no se encola |
| Instalable en el móvil | Sí, con manifest e iconos |
| Bloqueo por inactividad | **Sin cambios.** El caché es ciphertext; bloquear sigue tirando la clave |
| API | **No se toca.** Ni endpoint, ni columna, ni migración |
| `version` | No sube ninguna |

## 5) Lineamientos técnicos resultantes

- **El service worker cachea el shell, no las respuestas de la API.** Los datos van a
  IndexedDB explícitamente, porque un caché HTTP no sabe qué hacer cuando se cierra
  sesión y ahí es donde se filtraría una vault entre cuentas.
- **Nada descifrado toca el disco.** Ni el contenido, ni la clave de vault, ni la clave
  maestra derivada. `ADR-007` sigue rigiendo: lo que se persiste es lo que el servidor
  ya guardaba, y nada más.
- **El estado sin red se ve.** Leer una vault de hace tres días creyendo que es la de
  hoy es peor que no poder leerla, y ese fallo es silencioso por definición.
- **Un test que falle si el caché sobrevive al cierre de sesión**, y otro si una cuenta
  ve el caché de otra. Son las dos promesas cuya rotura no se nota usando la
  aplicación.
- **Se verifica con kastor apagado de verdad**, no con el modo offline del navegador.
  Es el camino que nadie recorre, y este proyecto lleva cinco iteraciones pagando por
  no recorrerlo.

## 6) Consecuencias asumidas

1. **La vault cifrada vive en cada dispositivo que la abrió**, con lo dicho en §2 sobre
   el rate limiting. Es la consecuencia central y la razón de que la opción esté
   apagada por defecto.
2. **Se puede estar leyendo algo desactualizado.** El indicador es la mitigación, y no
   es completa: si la contraseña cambió en otro dispositivo, la que se lee sin red es
   la vieja.
3. **La señal 1 de `ADR-013` §6 pierde parte de su significado.** Habrá menos ocasiones
   en que kastor apagado se note, así que dejará de medir la disponibilidad para medir
   otra cosa. Se anota aquí para que nadie lea esa señal más tarde como si nada hubiera
   cambiado.
4. **Hay que explicarlo a alguien que no lo construyó.** La segunda cuenta no sabe qué
   es un service worker y no tiene por qué; la opción se explica donde se activa, con la
   regla de `ADR-010`: donde se decide, no en una página de ayuda.

## 7) Lo que hay que verificar antes de prometerlo

**Safari puede borrar el almacenamiento de un sitio tras siete días sin usarlo.** Las
aplicaciones instaladas en la pantalla de inicio quedan fuera de esa poda, pero la
diferencia entre «instalada» y «abierta en Safari» es exactamente lo que decide si esta
funcionalidad existe en el iPhone o se evapora sola cada semana.

**No se da por sabido: se comprueba en el dispositivo real antes de cerrar la
iteración.** Si resulta que no se sostiene, la decisión no cambia —en escritorio y en
Android sigue valiendo— pero la promesa que se le hace al usuario sí.

## 8) Impacto en APIs y contratos

**Ninguno en el servidor.** No hay endpoint nuevo, ni columna, ni migración, ni cambio
en la forma de ninguna respuesta. Todo ocurre en el cliente, que es el mismo argumento
que tuvo `ADR-007` a su favor.

`ADR-007` **no queda superseded**, y merece decirse porque parece que sí: aquel ADR
decidió que **el token** no se persiste, y eso sigue siendo cierto sin matices. Lo que
se persiste aquí es ciphertext, que es lo que el servidor ya almacenaba, y sigue
haciendo falta la contraseña maestra para sacarle algo.
