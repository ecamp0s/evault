# Desplegar eVault en un servidor propio

Guía para poner eVault en una máquina de tu red local y usarlo de verdad, no solo
mirarlo. Para arrancarlo desde un clon y ver qué hace, el README es más corto.

Las decisiones que hay detrás están en
[ADR-012](../architecture/decisions/ADR-012-estrategia-de-despliegue.md). Aquí solo
está el procedimiento, y **está verificado ejecutándolo**, no escrito de memoria:
el orden y los avisos vienen de lo que falló al hacerlo.

---

## Antes de nada: HTTPS no es opcional

No es endurecimiento ni buena práctica. **Sin HTTPS, eVault no arranca.**

La Web Crypto API solo existe en contextos seguros. Fuera de `localhost`, un
navegador servido por `http://` no tiene `crypto.subtle`, así que no hay
derivación de claves: no puedes registrarte, ni entrar, ni descifrar nada. Y el
fallo no se explica solo — llega como un `Uncaught (in promise)` sin mensaje,
porque lo que revienta es una propiedad de `undefined` dentro de una promesa.

**El truco de `.localhost` no sirve aquí.** Los navegadores tratan como de
confianza los nombres acabados en `.localhost` porque los resuelven contra su
propio loopback. Eso vale cuando el navegador está en la misma máquina que el
servidor; desde otro dispositivo de la red no llega nunca al servidor.

Por eso esta guía monta TLS antes que ninguna otra cosa.

---

## Lo que necesitas

- Una máquina Linux encendida cuando quieras usar la vault, con **Docker Engine** y
  el plugin de Compose. Hace falta **Compose 2.24 o posterior**: el fichero de
  despliegue usa `!override` para sustituir los puertos del de desarrollo en vez de
  sumarse a ellos, y en versiones anteriores esa etiqueta no existe
- **Avahi** corriendo, para publicar nombres en la red local (viene de serie en
  Ubuntu y derivadas)
- **Una IP fija** para esa máquina. Lo más cómodo es reservarla en el router por su
  dirección MAC: así no cambia y no hay que tocar nada más
- Acceso `sudo` en esa máquina, solo para instalar un servicio

Si vas por WiFi, reserva la MAC de la interfaz inalámbrica; si por cable, la del
cable. Reservar la que no usas no hace nada.

---

## 0. Si ahí ya hubo un despliegue, límpialo primero

**Sáltate esta sección si la máquina está limpia.** Si ya alojó eVault alguna vez
—aunque fuera una prueba que creas retirada—, se limpia **antes** de desplegar
encima y no después. Es lineamiento de
[ADR-013](../architecture/decisions/ADR-013-operacion-de-la-instancia-personal.md).

El motivo no es el orden: es que los restos de un despliegue anterior **no fallan,
engañan**.

```bash
docker compose -f compose.yaml -f compose.deploy.yaml down -v   # contenedores y datos
docker rmi evault-web:latest evault-api:latest                  # las imágenes construidas
docker builder prune -af                                        # y sus capas cacheadas
```

Tres cosas que conviene entender antes de ejecutarlas:

**El `-v` borra los datos.** Es lo que quieres al preparar una máquina para una
instancia nueva, y lo último que quieres en cualquier otro momento. Si hay algo
dentro que te importe, esto va después de un backup y no antes.

**Las dos imágenes construidas llevan el tag `latest`, y ahí está el engaño.** Una
imagen vieja con el mismo tag hace que el despliegue arranque **código que no es el
que crees**, y no hay ningún error que lo diga. Las oficiales —`mysql:8` y las bases
de los `Dockerfile`— no tienen ese problema, porque su tag identifica una versión: no
hace falta borrarlas y volver a descargar gigabytes.

**La caché de construcción es el resto que más se olvida.** `--build` reconstruye,
pero reutiliza capas intermedias: sin `builder prune`, un despliegue «desde cero»
puede montarse sobre capas de meses atrás. En la máquina donde se escribió esto había
**3 GB de caché** después de que los contenedores y los volúmenes ya estuvieran
retirados.

Y comprueba que no quedan servicios apuntando a nada:

```bash
docker ps -a && docker volume ls && docker images
systemctl list-units 'evault*' --all
```

**Un alias mDNS que sobrevive a su despliegue es peor que un alias que no existe.** El
nombre sigue resolviendo a la máquina, así que el navegador no dice «no encuentro ese
host» sino que no puede conectar — y eso parece un fallo de la aplicación cuando lo
que pasa es que no hay aplicación. Si vas a reutilizar el servicio de la sección 1,
comprueba **qué publica** en vez de suponerlo:

```bash
systemctl cat evault-mdns.service | grep ExecStart
getent hosts evault.local
```

---

## 1. Los nombres

eVault sirve **dos orígenes**: la SPA y la API. Necesitas por tanto dos nombres que
resuelvan a la misma máquina.

> **Los nombres han de ser de una sola etiqueta bajo `.local`.**
>
> `evault.local` resuelve. **`api.evault.local` no**, y falla de la peor manera
> posible: avahi lo publica sin dar ningún error, el registro existe, y
> sencillamente nadie lo consulta, porque los resolvedores no preguntan por mDNS los
> nombres multietiqueta. Si eliges nombres con subdominios, todo parecerá correcto
> hasta que abras el navegador.
>
> De ahí que los nombres por defecto sean `evault.local` y `evault-api.local`.

El repositorio trae un publicador de alias que habla directamente con avahi por
D-Bus, así que no hace falta instalar `avahi-utils`:

```bash
sudo mkdir -p /opt/evault && sudo cp scripts/mdns-alias.py /opt/evault/
```

Crea `/etc/systemd/system/evault-mdns.service`, sustituyendo `TU_USUARIO`:

```ini
[Unit]
Description=Alias mDNS de eVault
After=network-online.target avahi-daemon.service
Wants=network-online.target
Requires=avahi-daemon.service

[Service]
Type=simple
User=TU_USUARIO
ExecStart=/usr/bin/python3 /opt/evault/mdns-alias.py evault.local evault-api.local
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Y actívalo:

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now evault-mdns
```

**Tiene que ser un servicio y no un comando suelto.** Los registros mDNS viven
mientras viva el proceso que los publicó: avahi los libera en cuanto se cierra la
conexión D-Bus. Un `mdns-alias.py` lanzado a mano desaparece al cerrar la sesión y,
por supuesto, al reiniciar.

Comprueba que resuelven **desde otro dispositivo**, no solo desde el servidor:

```bash
ping evault.local
```

---

## 2. Configuración

### Dónde va el clon

Donde quieras: **el sitio del clon no afecta a nada**, y merece decirse porque en
Docker suele afectar. `compose.yaml` fija `name: evault`, así que el prefijo de
contenedores, red y volúmenes es ese **independientemente del directorio**. Puedes
mover el clon después sin perder los datos.

Si la máquina va a alojar más aplicaciones, agrupar ayuda:

```bash
mkdir -p ~/apps && cd ~/apps && git clone https://github.com/ecamp0s/evault.git
```

Así `ls ~/apps` responde «qué corre en esta máquina», que es lo que un home plano
deja de responder en cuanto hay tres. `/opt` es la otra convención razonable, pero
necesita `sudo` para escribir.

> **Y el corolario que sí importa:** como el prefijo de los volúmenes es `evault` y
> no depende del directorio, **dos clones de eVault en la misma máquina comparten
> datos.** La separación que exige
> [ADR-009](../architecture/decisions/ADR-009-proyecto-personal-y-publico.md) §4
> entre una instancia con secretos reales y cualquier despliegue de demostración
> **no se consigue poniéndolos en carpetas distintas**: hacen falta máquinas
> distintas, o cambiar el `name`.

### El fichero

Copia `.env.example` a `.env` en la raíz del clon y ajusta al menos las
credenciales de la base de datos:

```bash
cp .env.example .env
```

| Variable | Para qué |
|---|---|
| `APP_HOST` | El nombre de la SPA. Por defecto `evault.local` |
| `API_HOST` | El nombre de la API. Por defecto `evault-api.local` |
| `HTTPS_PORT` | Puerto del anfitrión. Por defecto 443 |
| `DB_PASSWORD`, `DB_ROOT_PASSWORD` | **Cámbialas.** Las de ejemplo valen para mirar el proyecto, no para guardar contraseñas |

No hace falta tocar `APP_ENV` ni `APP_DEBUG`: el fichero de despliegue los fija en
`production` y `false`. Con `APP_DEBUG` activo, una traza de Laravel enseña
configuración y fragmentos de entorno a cualquiera que provoque un error.

---

## 3. Levantar

```bash
docker compose -f compose.yaml -f compose.deploy.yaml up -d --build
```

Son **dos ficheros y en ese orden**: el segundo modifica al primero. Si ejecutas
solo `compose.yaml` tendrás la versión de desarrollo, por `http` y sin cifrado
posible.

La primera vez tarda: construye la SPA, instala dependencias de PHP y espera a que
MySQL acepte conexiones. Para ver qué está haciendo:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml logs -f api
```

Cuando aparezca `[entrypoint] listo`, está servido.

> **Si cambias `APP_HOST`, `API_HOST` o el puerto, hay que reconstruir**, no basta
> con reiniciar: la URL de la API y la Content-Security-Policy se escriben **dentro
> del JavaScript** durante el build. Un contenedor reiniciado sin reconstruir sigue
> apuntando al nombre viejo, y lo hace en silencio — la aplicación carga y solo
> falla al hablar con la API.

---

## 4. Confiar en el certificado

Caddy emite los certificados con una autoridad propia. No hace falta dominio
público, ni Let's Encrypt, ni abrir un solo puerto a internet.

El precio es este: **cada dispositivo desde el que abras la vault tiene que confiar
en esa autoridad, una vez.** Es la parte con más fricción de todo el despliegue.

Saca el certificado raíz:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec web cat /data/caddy/pki/authorities/local/root.crt > evault-ca.crt
```

Y luego, según el dispositivo:

**Windows** — PowerShell como administrador:

```powershell
Import-Certificate -FilePath evault-ca.crt -CertStoreLocation Cert:\LocalMachine\Root
```

Tiene que ser `LocalMachine\Root` y no `CurrentUser\Root`: el segundo funciona en Edge
pero no siempre en Chrome, y nunca en Firefox, que usa su propio almacén.

> **No verifiques esto con `curl.exe`, porque va a fallar aunque esté bien.** El
> `curl` de Windows usa schannel, que comprueba la revocación del certificado en modo
> *hard-fail*, y una autoridad local no publica CRL ni OCSP. El error es
> `CRYPT_E_NO_REVOCATION_CHECK`, y es **muy fácil confundirlo con que la instalación no
> ha funcionado**.
>
> La pista para distinguirlos: si antes de instalar salía `SEC_E_UNTRUSTED_ROOT` y
> ahora sale `CRYPT_E_NO_REVOCATION_CHECK`, **la confianza ya funciona** — el fallo se
> ha movido a un paso posterior de la validación. Para comprobarlo con `curl.exe` hay
> que añadir `--ssl-no-revoke`; los navegadores no lo necesitan, porque no exigen CRL a
> una CA local.

**Linux**:

```bash
sudo cp evault-ca.crt /usr/local/share/ca-certificates/evault-ca.crt && sudo update-ca-certificates
```

**macOS** — Acceso a Llaveros, importar en «Sistema» y marcar «Confiar siempre».

**Android** — Ajustes → Seguridad → Cifrado y credenciales → Instalar un certificado
→ Certificado de CA.

**iOS** — son **dos pasos**, y el segundo no es evidente: primero instalas el perfil,
y **después** hay que activarlo en Ajustes → General → Información → Ajustes de
confianza de certificados. Sin ese segundo paso el certificado está instalado pero
no se confía en él, y el navegador sigue protestando.

Firefox usa su propio almacén y no el del sistema, así que ahí hay que importarlo
aparte aunque el resto del equipo ya confíe.

> **No borres el volumen `caddy-data`.** Ahí vive la autoridad. Si se pierde, Caddy
> genera una nueva y hay que repetir esto en todos los dispositivos. Recrear los
> contenedores es seguro: el volumen sobrevive, y el certificado sigue siendo el
> mismo.

---

## 5. Primer arranque

Abre `https://evault.local` y registra tu cuenta. Comprueba que el navegador
muestra el candado sin avisos: si protesta, el certificado no está bien instalado y
no vas a poder registrarte, porque sin contexto seguro no hay criptografía.

Después, y antes de meter nada importante:

1. **Genera la clave de recuperación** desde el menú de tu cuenta, y guárdala
   **fuera de esta máquina**. Es la única salida si olvidas la contraseña maestra:
   el servidor no puede ayudarte, por diseño
2. **Haz un backup y pruébalo**, siguiendo la sección siguiente

Si quieres ver la aplicación con contenido antes de usarla en serio, importa
[`examples/sample-vault.evault`](../../examples/sample-vault.evault) con la
contraseña que da el README.

### Comprobar que el servidor de verdad no puede leer nada

Merece hacerlo una vez, en tu propia instancia, en vez de creerte el README. Guarda
un item con una contraseña reconocible —por ejemplo `zanahoria-de-prueba`— y
búscala en la base de datos:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec db sh -c 'mysql -uevault -p$MYSQL_PASSWORD evault -e "SELECT COUNT(*) AS coincidencias FROM vault_items WHERE ciphertext LIKE \"%zanahoria%\""'
```

**Tiene que dar `0`.** Cualquier otra cosa significa que algo se está guardando en
claro, y ahí hay que parar. Para ver qué guarda en su lugar:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec db sh -c 'mysql -uevault -p$MYSQL_PASSWORD evault -e "SELECT version, LEFT(ciphertext,60) FROM vault_items\G"'
```

`version 2` es el esquema cifrado, y el `ciphertext` es AES-256-GCM en base64.

> **`$MYSQL_PASSWORD` va entre comillas simples y no se saca del `.env`.** Lo expande
> el shell **del contenedor**, que ya tiene la contraseña en su entorno. Escrito así,
> el comando funciona igual desde bash que desde PowerShell; si en su lugar lees el
> `.env` con `$(grep …)`, PowerShell intenta expandirlo **en tu máquina** y acabas
> mandando una contraseña vacía con un `Access denied` que parece un problema de
> credenciales y no lo es.

---

## 6. Copias de seguridad

`evault:backup` escribe una copia restaurable con las cuatro tablas que tienen
datos, y conserva las siete últimas.

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec -u www-data api php artisan evault:backup
```

> **El `-u www-data` no es opcional.** Sin él, `docker compose exec` entra como
> root y las copias quedan con propietario `root` sobre el directorio montado desde
> el clon — con permisos `700`, de modo que **el dueño del servidor no puede ni
> listarlas**, y por tanto tampoco sacarlas de la máquina. Una copia de seguridad
> que su dueño no puede recuperar no es una copia de seguridad.
>
> El entrypoint alinea `www-data` con el usuario propietario del clon, así que con
> `-u www-data` los ficheros salen correctos.

Para programarla, en el crontab del usuario dueño del clon:

```cron
0 3 * * * cd /ruta/al/clon && docker compose -f compose.yaml -f compose.deploy.yaml exec -T -u www-data api php artisan evault:backup >> /ruta/al/clon/api/storage/logs/backup.log 2>&1
```

El `-T` hace falta porque cron no tiene terminal. Y el destino del log **no es
`/tmp`** a propósito: se borra en cada arranque, y esta máquina se apaga queriendo.
Ver #264, y el guion de copia externa de la sección 7, que ya lleva su propio
registro y no necesita redirección ninguna.

### El comando se niega a escribir una copia que no sirve

Desde el issue #263, `evault:backup` **falla en vez de escribir** en dos casos, y
en los dos deja el código de salida distinto de cero para que cron lo note:

- **La instancia no tiene ningún dato.** Escribir esa copia solo puede desplazar a
  otras mejores por la rotación. Si es una instalación recién hecha y es lo
  esperado, `--allow-empty` lo permite.
- **La copia tendría muchas menos filas que la anterior**, por debajo de la mitad.
  Es el caso que de verdad hace daño: una base de datos que pierde casi todo sigue
  produciendo un fichero perfectamente válido. Si la pérdida es intencionada,
  `--min-ratio=0` desactiva la comprobación.

El umbral es generoso a propósito. Una comprobación que salta con un borrado normal
se acaba esquivando, y entonces no protege de nada.

Y el comando dice ahora **cuántas filas ha copiado y de qué tablas**:

```
Filas copiadas: 373 (users 1, vaults 1, vault_members 1, vault_items 370)
```

Esa línea es la que responde «¿la copia de aquella noche servía?» tres semanas
después. Antes no se guardaba en ninguna parte: el guion de copia externa invocaba
el comando con `>/dev/null` y la tiraba.

**Lo que esto NO comprueba, y conviene no confundirlo:** que el contenido cifrado
esté íntegro. El servidor no puede leerlo —`ADR-001` funcionando— así que la única
prueba real sigue siendo restaurar una copia y abrir la vault desde ella.

**Saca las copias de la máquina.** El fichero no va cifrado, y no es un descuido:
lo que hay dentro son los mismos blobs opacos que guarda el servidor, así que
moverlo no expone tus contraseñas. Sí lleva los hashes de autenticación y las
claves de vault envueltas, que no permiten descifrar nada pero tampoco conviene
repartir; por eso se escribe con permisos `600`.

Y lo más importante: **una copia que nadie ha restaurado nunca es un fichero, no una
copia de seguridad.** Prueba `evault:restore` contra una base de datos aparte de vez
en cuando, no el día que haga falta.

### Sacarla de la máquina, cifrada

Una copia en el mismo disco que los datos **no es una copia de seguridad**: un fallo
de ese disco se lleva las dos cosas. `scripts/offsite-backup.sh` hace las tres cosas
en orden —copia, cifra y sube— y se para en la primera que falle.

Necesita dos herramientas y una configuración:

```bash
sudo apt install -y age rclone
rclone config          # llama al remoto `nube` y el resto encaja sin cambios
age-keygen -o clave-backup.txt
```

**La clave privada no puede quedarse en la máquina.** Guárdala donde guardas la clave
de recuperación de la vault y borra el fichero del servidor. En el `.env` va **solo la
pública**:

```
EVAULT_BACKUP_RECIPIENT=age1...        # la pública: cifra y no descifra
EVAULT_BACKUP_REMOTE=nube:evault-backups
EVAULT_BACKUP_KEEP_REMOTE=30
```

> **Por qué asimétrico y no una passphrase.** La máquina lleva la clave pública, así
> que puede cifrar pero **no descifrar**. Quien comprometa el servidor no obtiene las
> copias anteriores ni las que ya están en el destino remoto: solo puede seguir
> produciendo copias que no puede leer. Con una clave simétrica haría falta el secreto
> aquí para poder cifrar, y con él se abriría todo. Es
> [ADR-013](../architecture/decisions/ADR-013-operacion-de-la-instancia-personal.md)
> §2.4, y es la misma idea que hace que el servidor no pueda leer la vault.
>
> La contrapartida se asume igual que la de la contraseña maestra: **si pierdes la
> clave privada, las copias son basura.**

> **Y la clave no puede vivir donde viven las copias.** Si guardas las copias cifradas
> en un proveedor y la clave privada en ese mismo proveedor, ese proveedor tiene a la
> vez el candado y la llave: el cifrado deja de protegerte **de él**, que era medio
> motivo de cifrarlo. Dos servicios distintos —o uno y un disco tuyo— y el problema
> desaparece. Es fácil de romper sin darse cuenta, porque «lo guardo en mi nube» suena
> igual de bien las dos veces.

Programada:

```cron
0 3 * * * cd $HOME/apps/evault && ./scripts/offsite-backup.sh
```

**Sin redirección, y no es un olvido.** Desde el issue #264 el guion escribe su
propio registro en `api/storage/logs/offsite-backup.log`, y sigue mandando la salida
por stdout para que cron pueda enviarla por correo si algo falla.

Antes esa línea acababa en `>> /tmp/evault-backup.log`, y ahí está el problema que
cierra #264: **`/tmp` no sobrevive a un arranque**, y esta máquina se apaga a
propósito. El registro se encontró con una sola línea, la de aquella mañana, sin
nada anterior — de modo que «¿cuándo fue la última copia buena?» no tenía forma de
responderse en la máquina.

El fichero rota solo al llegar a un mega, conservando un `.log.1`. Se puede cambiar
de sitio con `EVAULT_BACKUP_LOG`.

### Que una noche sin copia se note

El guion falla ruidosamente cuando corre y algo va mal. Lo que no cubría nadie es
que **no llegue a correr**: la máquina apagada a las 3, o cron roto. En los dos
casos no pasaba absolutamente nada, y nada es indistinguible de que todo fue bien.

Desde #265 hay una comprobación aparte, que el propio guion ejecuta al empezar y que
conviene además lanzar al arrancar la máquina:

```cron
@reboot sleep 180 && cd $HOME/apps/evault && ./scripts/check-backup-freshness.sh
```

> **El `sleep` no es superstición.** El reloj de esta máquina no se conserva entre
> arranques: systemd restaura la hora del último apagado y NTP la corrige unos
> segundos después. Sin esa espera, la comprobación puede hacerse con el reloj en el
> pasado. Si aun así ocurre, lo dice en vez de callarse, porque un reloj por detrás
> de la última copia calcularía una antigüedad diminuta y concluiría que todo está
> bien.

**Distingue dos situaciones que parecen la misma**, y esa es toda su razón de ser:

| Situación | Qué dice |
|---|---|
| La copia es vieja y la máquina lleva días **encendida** | Aviso, y sale con error: el cron no está produciendo copias |
| La copia es vieja y la máquina **acaba de arrancar** | Lo dice, sin alarma: estuvo apagada, y la copia de esta noche lo pone al día |

`ADR-013` decide que los apagados son deliberados y no se combaten, y que lo que
importa es el desfase entre la última copia y el último cambio, no el tiempo
apagada. Una vault a la que nadie llega es una vault que nadie cambia.

Por eso avisar de las dos cosas igual sería un error: una alerta que salta cada
lunes después de un fin de semana apagada es una alerta que se aprende a ignorar, y
entonces no está el día que hace falta.

La ventana son **tres días** y se cambia con `EVAULT_BACKUP_MAX_AGE_DAYS`, que no
admite cero: sin ventana no hay forma de distinguir un cron roto de una máquina
apagada, y el aviso perdería justamente lo que lo hace útil. Tres fallos seguidos de
un cron diario no son mala suerte; y es corto de sobra para que en el destino remoto
quede aún una copia reciente.

Para comprobar que el aviso salta de verdad, sin tocar las copias buenas:

```bash
mkdir -p /tmp/copias-falsas && touch -d "10 days ago" /tmp/copias-falsas/evault-000001-x.json
EVAULT_BACKUP_DIR=/tmp/copias-falsas EVAULT_UPTIME_SECONDS=691200 ./scripts/check-backup-freshness.sh
```

Debe avisar del cron. Repitiendo con `EVAULT_UPTIME_SECONDS=3600` —la misma copia
vieja, pero recién arrancada— debe decir que la máquina estuvo apagada y **no**
avisar. Que las dos ramas se puedan provocar es lo que permite saber que funcionan.

> **Con `EVAULT_BACKUP_DIR` puesto, el registro se va con él** al directorio de
> pruebas en vez de al de la instancia. Es deliberado: un ensayo no puede dejar
> avisos inventados en el registro de verdad, porque quien lo lea dentro de un mes
> no tendría forma de distinguirlos de un fallo real. Pasó dos veces comprobando
> esto en la máquina, y de ahí sale el valor por defecto.

Al terminar, `rm -rf /tmp/copias-falsas`.

> **La hora de cada línea es para quien lee, no para ordenar.** El reloj de esta
> máquina no es monótono entre arranques —de ahí #240—, así que una línea escrita
> justo después de un reinicio puede afirmar que viene del pasado. Lo que sí se puede
> creer es el número de secuencia del nombre del fichero.

### Recuperar una copia remota

Es el ciclo que de verdad demuestra que las copias sirven. **Son dos máquinas y hay
que tenerlo presente**, porque los comandos no se ejecutan todos en el mismo sitio:
descifrar en el servidor es imposible **por diseño**, ya que la clave privada no está
ahí. Si lo intentas, `age` responde `failed to open file: clave-backup.txt`, y ese
error no es un problema — es la garantía funcionando.

**En el servidor**, bajar la copia del destino remoto:

```bash
rclone copy nube:evault-backups/evault-000007-2026-08-17-193801.json.age .
```

**En la máquina donde guardaste la clave privada** —tu portátil, no el servidor—,
traer el fichero y descifrarlo:

```bash
scp servidor:evault-000007-2026-08-17-193801.json.age .
age --decrypt --identity clave-backup.txt -o copia.json evault-000007-*.json.age
```

Si eso produce un JSON que empieza por `"format": "evault-backup"`, **la cadena entera
sirve**: producida por el cron, cifrada, subida, descargada y descifrada.

### Ensayar una restauración sin tocar la instancia buena

Es lo que de verdad demuestra que las copias sirven, y `ADR-013` §5.2 pide hacerlo
**de vez en cuando y no el día que haga falta**. Verificado así el 18 de agosto de
2026 con 370 contraseñas reales dentro (#266).

> **Antes de nada, lo que puede costar los datos.** `compose.yaml` fija `name:
> evault` **dentro del fichero**, no lo toma del directorio. Un segundo clon sin más
> se apropia de los contenedores y volúmenes del primero, y un `docker compose down
> -v` desde él **borra la base de datos de la instancia buena**. Nada avisa. Por eso
> el `.env` de abajo empieza por `COMPOSE_PROJECT_NAME`. Ver #276.

**No hace falta descifrar nada.** El guion de copia externa cifra un fichero
temporal, lo sube y borra *el cifrado*; el JSON original se queda en
`api/storage/app/backups/` con permisos `600`, y se conservan los siete últimos. La
cadena de descifrado tiene su propia comprobación, la de más arriba.

En el servidor, con el clon de la instancia buena intacto:

```bash
git clone ~/apps/evault ~/apps/evault-restore
cd ~/apps/evault-restore
cat > .env <<'EOF'
COMPOSE_PROJECT_NAME=evault-restore
HTTP_PORT=8080
HTTPS_PORT=8443
APP_HOST=evault-restore.local
API_HOST=evault-restore-api.local
DB_DATABASE=evault
DB_USERNAME=evault
DB_PASSWORD=restore-temporal
DB_ROOT_PASSWORD=restore-temporal-root
APP_ENV=local
APP_DEBUG=false
EOF
```

Comprueba **antes de levantar nada** que el aislamiento es real:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml config | grep '^name:'
```

Tiene que decir `name: evault-restore`. Si dice `name: evault`, para: ese despliegue
iría contra la instancia buena.

```bash
docker compose -p evault-restore -f compose.yaml -f compose.deploy.yaml up -d --build
mkdir -p api/storage/app/backups
cp ~/apps/evault/api/storage/app/backups/evault-NNNNNN-*.json api/storage/app/backups/
docker compose -p evault-restore -f compose.yaml -f compose.deploy.yaml exec -T api   php artisan evault:restore storage/app/backups/evault-NNNNNN-*.json --force
```

> **La ruta no lleva `api/`.** El bind monta `./api` en `/var/www/html`, así que
> dentro del contenedor es `storage/app/backups/...`. Con `api/` delante responde
> «No existe», y parece que falte el fichero cuando lo que sobra es un prefijo.

Los nombres `.local` de la instancia de prueba no los publica nadie, porque el
servicio de mDNS solo anuncia los de la buena. Para el rato que dure:

```bash
nohup python3 /opt/evault/mdns-alias.py evault-restore.local evault-restore-api.local &
```

**Y ahora lo que hay que mirar de verdad, en un navegador**: entrar con la
contraseña maestra, abrir varios items y **revelar alguna contraseña**. Que la lista
muestre el número correcto de filas no demuestra nada — si la clave de vault
envuelta se hubiera restaurado mal, las filas estarían igual y los items no se
abrirían.

El certificado es de la CA interna de **esta** instancia, distinta de la de la
buena, así que el navegador protesta aunque tengas la otra instalada. **Hay que
aceptar la excepción en los dos orígenes, y primero en el de la API**: si solo se
acepta el de la aplicación, esta carga y el inicio de sesión falla con un error de
red que no dice por qué.

Al terminar, y comprobando **otra vez** a qué proyecto apunta:

```bash
docker compose -p evault-restore -f compose.yaml -f compose.deploy.yaml down -v
rm -rf ~/apps/evault-restore
pkill -f 'mdns-alias.py evault-restore'
```

Tarda unos quince minutos de reloj, y el reparto tranquiliza: levantar la instancia
se lleva ocho, y `evault:restore` **diez segundos**. En una recuperación de verdad
la instancia ya estaría en marcha.

**Borra el descifrado en cuanto termines.** Lleva los hashes de autenticación y las
claves de vault envueltas en claro; no descifran nada por sí solos, pero es
justamente el material que el cifrado existe para no repartir.

Y para restaurarla de verdad, `evault:restore` **contra una instancia limpia y no
contra la que está en uso**, que es lo que distingue probar un backup de sobrescribir
los datos buenos:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec -T -u www-data api \
  php artisan evault:restore --path=copia.json
```

### Tokens caducados

Los tokens de sesión caducan a las 12 horas, y al entrar se barren los que ya
hayan caducado de esa cuenta. Con un solo usuario eso basta y **no hay que
programar nada**.

Si la instancia tiene varias cuentas, las que dejen de entrar conservarán sus
tokens caducados —inservibles, pero ocupando— y ahí sí compensa programar la purga
que trae Sanctum:

```cron
30 3 * * * cd /ruta/al/clon && docker compose -f compose.yaml -f compose.deploy.yaml exec -T -u www-data api php artisan sanctum:prune-expired --hours=24 >> /tmp/evault-prune.log 2>&1
```

El `--hours=24` deja un día de margen tras la caducidad antes de borrar el
registro, que es útil si alguna vez hay que mirar cuándo se usó una sesión.

---

## 7. Actualizar

**Antes de nada, comprueba que tienes una copia restaurable.** No que se hizo: que se
puede recuperar. Es la sección 6, y este es el momento para el que existe.

```bash
./scripts/offsite-backup.sh
git pull
docker compose -f compose.yaml -f compose.deploy.yaml up -d --build --force-recreate api
```

> ### `--force-recreate` no es opcional, y aquí está el porqué
>
> Sin él **las migraciones no se aplican**, y no falla nada: la aplicación se queda con
> el código nuevo y el esquema viejo, que es un estado incoherente y silencioso.
>
> El motivo es una consecuencia de cómo está montado esto, y no es evidente: **el
> código va por volumen, no dentro de la imagen** —es lo que permite que un cambio en
> `api/` se vea sin reconstruir—. Así que un `git pull` con migraciones nuevas **no
> cambia la imagen**, y si la imagen no cambia, `up -d --build` **no recrea el
> contenedor**. Y como las migraciones las lanza el entrypoint al arrancar, sin
> recreación no se lanzan.
>
> Comprobado sobre la instancia real con una migración de prueba: con `--build` a
> secas quedó `Pending` mientras los contenedores llevaban tres horas arriba; con
> `--force-recreate`, `Ran`.

Si prefieres no depender de eso, lanza las migraciones a propósito y no como efecto
secundario del arranque:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec -T -u www-data api php artisan migrate --force
```

Los datos y el certificado están en volúmenes y sobreviven a la recreación de los
contenedores — comprobado destruyéndolos y recreándolos, no suponiéndolo.

### Comprobar que la actualización no se llevó nada

Contando antes y después, no mirando si la aplicación abre:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec -T db sh -c 'mysql -uevault -p$MYSQL_PASSWORD evault -N -e "SELECT COUNT(*) FROM vault_items; SELECT SHA2(GROUP_CONCAT(ciphertext),256) FROM vault_items"'
```

La huella es lo que de verdad prueba que los datos están **iguales** y no solo que hay
el mismo número de filas.

### La vuelta atrás

Es la parte que nadie ejecuta hasta el día que la necesita, así que conviene haberla
hecho una vez. Si la versión nueva falla:

```bash
docker compose -f compose.yaml -f compose.deploy.yaml exec -T -u www-data api php artisan migrate:rollback --force
git checkout <commit-anterior>
docker compose -f compose.yaml -f compose.deploy.yaml up -d --build --force-recreate api
```

**El `rollback` va primero.** Volver el código sin revertir el esquema deja la
aplicación vieja hablando con una base de datos que no reconoce, y ese es el estado
del que sí hay que salir restaurando el backup.

Verificado el ciclo entero sobre la instancia real —migración sobre una tabla con
filas, actualización, vuelta atrás— con las huellas de `vault_items` y de
`vault_members` idénticas antes y después.

---

## Convivir con otras aplicaciones

Esta guía deja a eVault escuchando en el 443, que es lo razonable si es lo único
que corre en esa máquina. **Pero el 443 es del servidor, no de eVault.**

**El motivo es que los nombres resuelven a la misma IP.** `evault.local` y
`marco.local` serían dos alias mDNS de la misma máquina, así que una conexión al 443
la recibe **un solo proceso** — el sistema no deja que dos contenedores mapeen el 443
a la vez. Ese proceso es el que tiene que mirar el `Host` y decidir a dónde va cada
nombre.

Si vas a alojar más aplicaciones, el patrón que escala es otro: un **frontal
compartido** dueño del 443 y del TLS, que reparte por nombre, y cada aplicación
escuchando en un puerto interno sin saber de las demás.

Dos cosas que abaratan esa migración cuando llegue, y que conviene saber **antes** de
elegir un puerto raro «por si acaso»:

- **El Caddy de eVault ya reparte por nombre.** Su `Caddyfile` sirve `APP_HOST` y
  `API_HOST` con matchers por host, así que ya es un frontal con dos entradas. Añadir
  un tercer nombre es un bloque más — barato, a cambio de que la configuración de
  eVault pase a conocer otras aplicaciones.
- **Mover eVault a un puerto interno cuesta un `up -d --build`.** Es un comando y unos
  minutos, no un rediseño. Así que empezar en el 443 y migrar el día que haga falta
  suele salir mejor que arrastrar un puerto en la URL desde el primer día para un
  frontal que todavía no existe.

Para eso, en tu `.env`:

```
HTTPS_PORT=8443
```

y configuras tu frontal para que envíe `evault.local` y `evault-api.local` a ese
puerto. eVault no asume ningún dominio ni ningún puerto —es lineamiento de
[ADR-005](../architecture/decisions/ADR-005-arquitectura-self-hosteable.md)— así que
no hay nada más que cambiar.

El esquema de nombres escala igual, pero **en horizontal**: `fotos.local`,
`notas.local`, cada una con su alias. No en subdominios, por el límite de mDNS de
la sección 1.

---

## Qué no cubre esta guía

**Acceso desde fuera de tu red.** Todo lo de aquí vive en la red local. Para
consultar la vault desde la calle hace falta una VPN o un túnel, y eso es una
decisión con sus propios riesgos: `ADR-012` §6 la deja como reevaluación pendiente
y apunta al túnel antes que a exponer la máquina.

**Despliegue en hosting compartido.** eVault cabe en uno —es Laravel más ficheros
estáticos, y el `dist/` de la SPA se sube tal cual sin necesitar Node en el
servidor—, pero ese camino **no está verificado** y por eso no se documenta como si
lo estuviera.

**Alta disponibilidad, réplicas o balanceo.** Es un gestor de contraseñas personal
en una máquina. Si algún día deja de serlo, será otro documento.
