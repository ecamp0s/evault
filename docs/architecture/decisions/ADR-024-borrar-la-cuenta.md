# eVault — Borrar la cuenta

Fecha de decisión: 2026-09-28 (Iteración 19, #713)
Fecha de registro: 2026-09-28
Estado: Propuesta
Depende de: ADR-001 (zero-knowledge), ADR-004 (multi-tenancy), ADR-007 (token de sesión en memoria), ADR-008 (arquitectura de claves), ADR-010 (clave de recuperación), ADR-013 (operación de la instancia personal), ADR-018 (qué se conserva tras un borrado), ADR-019 (la vault sin red), ADR-021 (desbloqueo con passkey), ADR-023 (la extensión de navegador)

## 1) Contexto

**Hoy no se puede borrar una cuenta.** No hay endpoint ni pantalla: la única salida es
pedirle al dueño de la instancia que borre filas a mano. En un producto que custodia
secretos, poder irse del todo es básico, y `ADR-009` no lo hace menos necesario: la
instancia personal tuvo dos cuentas hasta el 9 de septiembre de 2026, y cualquiera que
despliegue el repositorio puede tener más.

### Lo que ya lo hace barato

**El esquema ya borra en cascada casi todo lo que cuelga de una cuenta.** `vaults` tiene
`personal_for_user_id` con `cascadeOnDelete`, y de la vault cuelgan en cascada
`vault_members`, `vault_items` —los vivos y los de la papelera de `ADR-018`— y
`passkeys`. `vault_members` y `passkeys` cuelgan además del usuario directamente. Borrar
la fila de `users` se lleva la vault entera y todos sus envoltorios.

**La excepción son los tokens**: `personal_access_tokens` es polimórfica, no tiene clave
ajena y no cae en cascada. Hay que borrarlos a propósito.

### Lo que lo hace delicado

**Es irreversible, y el servidor no puede rehacer nada** (`ADR-001`): no hay ningún sitio
donde reconstruir una vault que se borró. Y hay copias de la cuenta en sitios que el
servidor no controla:

- **Las copias de seguridad**: siete en la máquina y treinta fuera de ella, cifradas con
  `age` (`ADR-013`, `DEPLOYMENT.md` §6).
- **El caché sin red de otros dispositivos** (`ADR-019`), que lleva el envoltorio y se
  abre con la maestra sin preguntar a nadie.
- **Las credenciales de los passkeys**, que viven en los autenticadores —iCloud, Windows
  Hello— y no en el servidor (`ADR-021`).
- **El correo recordado por la extensión** (`ADR-023`).

## 2) Opciones evaluadas

### 2.1) Qué prueba de identidad se pide

#### Opción A (elegida): el hash de autenticación de la contraseña maestra

La misma prueba que ya piden rotar la maestra y cambiar el correo: `current_password`,
comprobado contra `users.password`, con `InvalidCredentials` si no coincide y un
limitador propio, como `auth.master-password`.

**Una operación irreversible se decide con algo que se sabe**, no con algo que se tiene
abierto.

#### Opción B (descartada): que baste el token

Un token prueba que hay una pestaña abierta, no quién está delante. **Una pestaña
olvidada en un equipo ajeno, o un script inyectado en ella, borraría la cuenta entera.**
Rotar la maestra ya se negó a esto; borrar la cuenta tiene más motivos y no menos.

#### Opción C (descartada): aceptar el passkey como sustituto

`ADR-021` decidió que **el passkey es un atajo revocable y la maestra sigue siendo el
camino principal**, y que ninguna pantalla lo ofrece por delante. Su precio, escrito en
la pantalla de passkeys, es que quien desbloquee el dispositivo con su cara abre la vault
sin saber la maestra. Aceptarlo aquí sería poner la operación más grave de la aplicación
detrás de ese atajo.

**Y la clave de recuperación tampoco sustituye a la maestra aquí.** Quien ha perdido la
maestra y quiere irse recupera primero (`ADR-010`), que le deja una maestra nueva, y
después borra. Dos pasos, pero ninguno nuevo.

### 2.2) Inmediato o diferido

#### Opción A (elegida): inmediato, en una transacción

Todo se borra en la misma transacción, o no se borra nada, y la respuesta ya es la de
una cuenta que no existe.

#### Opción B (descartada): diferido, con una ventana para arrepentirse

Lo que hacen Google o GitHub: la cuenta queda desactivada unos días y luego desaparece.
Descartada por tres cosas:

- **La cuenta seguiría existiendo con datos que su dueño pidió borrar**, y eso es
  justo lo que la operación promete que no pasa.
- **Obligaría a un estado nuevo, «desactivada», que cada endpoint tendría que respetar**,
  más una purga programada. Es la papelera de `ADR-018` aplicada a la cuenta entera,
  con toda su maquinaria, para cubrir un error que aquí ya está cubierto.
- **El error que cubre no se comete sin darse cuenta.** La papelera existe porque un
  borrado equivocado se descubre al día siguiente. Borrar la cuenta pide la maestra, el
  correo escrito a mano y una confirmación que dice que no hay vuelta atrás (§2.5).

#### Opción C (descartada): que pase por la papelera

La papelera es de entradas, y **sin cuenta no hay nadie que pueda abrirla**. Una cuenta
borrada con la vault en la papelera sería una vault que ya nadie puede restaurar ni ver,
esperando su purga.

### 2.3) Qué se borra, y qué no se puede borrar

**Se borra, de la base**: la fila de `users` —con el hash de autenticación y el de
recuperación—, la vault personal, sus `vault_members` —con el envoltorio ordinario y el
de recuperación—, sus `vault_items` vivos y en la papelera, sus `passkeys` con sus
envoltorios, y **todos** sus tokens, el que hace la petición incluido.

**No se puede borrar desde aquí, y la pantalla lo dice antes de confirmar**:

- **Las copias de seguridad**: las de la máquina hasta que roten —siete por defecto— y
  las de fuera, treinta por defecto. **No se reescriben**, por dos razones: una copia
  editada deja de ser lo que había, que es lo único que la hace útil; y **fuera de la
  máquina el servidor ni siquiera puede leerlas**, porque la clave privada de `age` no
  está en él (`ADR-013` §5.2). Lo que conservan es ciphertext que solo abre la maestra,
  la clave de recuperación o un passkey de esa cuenta: **el riesgo que dejan es el
  mismo que había antes de borrar, con fecha de caducidad**. Y restaurar una copia
  anterior al borrado **devuelve la cuenta**, que es lo que tiene que decir
  `DEPLOYMENT.md`.
- **El caché sin red de otros dispositivos.** Se queda hasta que alguien pulsa «Olvidar
  esta cuenta en este dispositivo» allí, y mientras tanto **se sigue abriendo sin red
  con la maestra**, porque lleva el envoltorio. El servidor no puede alcanzarlo, y un
  dispositivo que vuelve a conectar **no puede enterarse de que la cuenta ya no existe**
  sin que el login pase a responder distinto a una cuenta borrada que a una contraseña
  equivocada: eso sería un oráculo de existencia de cuentas, que `LoginUser` evita a
  propósito.
- **Las credenciales de los passkeys** siguen en cada autenticador. No abren nada —el
  envoltorio que abrían ya no existe—, pero aparecen en el gestor de passkeys del
  sistema hasta que su dueño las quita.
- **El correo recordado por la extensión.** Solo el correo: su token cae con la cuenta,
  y el siguiente uso del popup lo bloquea (#712).

**En este dispositivo**, la web hace lo que hace cerrar sesión y algo más: olvida la
clave, borra su caché de esa cuenta y el usuario recordado.

### 2.4) Exportar antes

**La pantalla lo ofrece antes de confirmar, y no obliga.** Es lo único que convierte
«irreversible» en «irreversible, pero con tus contraseñas a salvo», así que va delante.
Obligar sería peor que ofrecer: forzaría a dejar un fichero con la vault en un equipo que
quizá no es de quien se va.

### 2.5) La confirmación

**Además de la maestra, se escribe el correo de la cuenta**, como hace GitHub con el
nombre del repositorio. La maestra prueba quién es; el correo escrito prueba que sabe
**qué** está borrando, y es la frase que un gestor de contraseñas no rellena solo.

**Y se comprueba en los dos lados**: la pantalla no habilita el botón hasta que coincide,
y la API lo recibe y lo compara con el de la cuenta. El *double guard* de siempre: la
pantalla es la comodidad y la aplicación es la barrera.

### 2.6) Qué queda en el servidor después

**Nada de la cuenta.** Ni una fila de «cuenta borrada», ni un registro de que existió.
Un rastro así sería exactamente el tipo de metadato que este proyecto no guarda sin
motivo, y aquí el motivo sería sospechar de quien se va. **El correo queda libre** para
darse de alta otra vez, como una cuenta nueva y vacía.

## 3) Decisión final

| Elemento | Definición |
|---|---|
| Prueba de identidad | **Hash de la maestra** (`current_password`). Ni el token solo ni el passkey |
| Confirmación | **El correo de la cuenta escrito a mano**, comprobado en la pantalla y en la API |
| Cuándo | **Inmediato**, en una transacción. Sin estado «desactivada» ni ventana |
| Qué se borra | Usuario, vault personal, miembros y envoltorios, items vivos y en la papelera, passkeys, **todos** los tokens |
| Copias de seguridad | **No se tocan.** Las conservan hasta que roten, y la pantalla lo dice |
| Caché de otros dispositivos | **No se alcanza.** La pantalla dice cómo borrarlo allí |
| Passkeys en los autenticadores | **Quedan huérfanos.** La pantalla dice que se pueden quitar |
| Este dispositivo | Olvida la clave, su caché de la cuenta y el usuario recordado |
| Exportar | **Se ofrece antes**, sin obligar |
| Rastro en el servidor | **Ninguno.** El correo queda libre |

## 4) Lineamientos técnicos resultantes

- **Un servicio de aplicación, `DeleteAccount`**, con `handle()` que recibe el id del
  usuario, el hash y el correo. **La comprobación del hash y del correo vive en el
  servicio**, y no solo en el controlador como en rotar la maestra: es la operación más
  destructiva que existe, y la segunda barrera no puede depender de quién la llame.
- **Una transacción con `lockForUpdate`** sobre el usuario, como `RotateMasterPassword`.
- **Los tokens se borran a mano**, dentro de la transacción: no tienen clave ajena.
- **Un test que enumere tabla por tabla** lo que queda de la cuenta después: ninguna fila.
  Y **tests de aislamiento cross-tenant**: borrar una cuenta no toca nada de otra, ni sus
  vaults, ni sus items, ni sus passkeys, ni sus tokens.
- **Un limitador propio**, `auth.delete-account`, con la forma de `auth.master-password`.
- **`DELETE /api/auth/account`**, con `current_password` y `email` en el cuerpo, y **204**.
- **Una respuesta equivocada no dice cuál de las dos falló**: maestra o correo, el mismo
  `InvalidCredentials`.
- **En la web**, al volver: olvidar la clave, `forgetCachedAccount` y `forgetUser`, y
  llevar al alta con un mensaje que diga que la cuenta ya no existe. Sin red no se ofrece:
  es una escritura (`ADR-019`).
- **La pantalla va al final del menú de usuario**, no junto a lo que se usa a diario.

## 5) Consecuencias asumidas

1. **No tiene vuelta atrás.** Es el objetivo, y la pantalla lo dice sin suavizarlo.
2. **Las copias de seguridad conservan la cuenta hasta que roten**, unas semanas con la
   configuración por defecto. Cifrada, y abrible solo con lo que ya la abría.
3. **Restaurar una copia anterior devuelve la cuenta.** Es lo que hace una copia.
4. **Un dispositivo con el caché activado sigue abriendo la vault sin red** hasta que se
   olvide allí. El servidor no puede avisarle sin convertir el login en un oráculo.
5. **Los passkeys quedan en los autenticadores como credenciales huérfanas.**
6. **No queda rastro de que la cuenta existió.** Si alguien reclama después, no hay nada
   que mirar, y es preferible a guardar un registro de quién se fue.

## 6) Triggers de reevaluación

1. **Llegan las vaults compartidas.** Hoy solo hay vaults personales, que caen en
   cascada con su dueño. Una vault compartida perdería solo la fila del miembro que se
   va, y si era su último dueño quedaría huérfana: hay que decidir qué pasa con ella
   antes de que exista la primera.
2. **Cambia la retención de las copias.** El «unas semanas» de la pantalla sale de siete
   copias en la máquina y treinta fuera; si cambia, la frase se rehace.
3. **La instancia la opera alguien distinto de quien tiene la cuenta.** Hoy son la misma
   persona. Si dejan de serlo, borrar la cuenta de las copias pasa a ser trabajo del
   operador, y haría falta un procedimiento escrito para pedirlo.
4. **Llega la app nativa**, con su propio almacenamiento. Es un sitio más donde la cuenta
   sobrevive a su borrado, y la pantalla tendría que nombrarlo.

## 7) Impacto en APIs y contratos

| Contrato | Cambio |
|---|---|
| `DELETE /api/auth/account` | **Nuevo**, autenticado, con `current_password` y `email`, limitador propio y **204** |
| Tablas | **Ninguna nueva ni ninguna columna.** Las cascadas que ya existen hacen casi todo el trabajo |
| Blob y `.evault` | **Sin cambios.** No sube ninguna versión |
| `evault:backup` y `evault:restore` | **Sin cambios.** `DEPLOYMENT.md` gana la advertencia de que restaurar devuelve una cuenta borrada |

### El estado de los ADR anteriores

- **`ADR-018` no se toca.** Su papelera es de entradas; esta decisión la deja fuera a
  propósito (§2.2, opción C).
- **`ADR-019` no se toca, pero gana una consecuencia**: el caché de un dispositivo
  sobrevive al borrado de la cuenta. Es la misma clase de desfase que su §6.2 ya asume
  —lo que se lee sin red puede ir por detrás de lo que se hizo en otro dispositivo—,
  llevada al extremo.
- **`ADR-021` no se toca.** El passkey sigue siendo un atajo, y por eso no abre esto.
- **`ADR-001` no se toca.** El servidor borra filas que no puede leer, y nada de esto le
  exige leer ninguna.
