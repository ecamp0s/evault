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
0 3 * * * cd /ruta/al/clon && docker compose -f compose.yaml -f compose.deploy.yaml exec -T -u www-data api php artisan evault:backup >> /tmp/evault-backup.log 2>&1
```

El `-T` hace falta porque cron no tiene terminal.

**Saca las copias de la máquina.** El fichero no va cifrado, y no es un descuido:
lo que hay dentro son los mismos blobs opacos que guarda el servidor, así que
moverlo no expone tus contraseñas. Sí lleva los hashes de autenticación y las
claves de vault envueltas, que no permiten descifrar nada pero tampoco conviene
repartir; por eso se escribe con permisos `600`.

Y lo más importante: **una copia que nadie ha restaurado nunca es un fichero, no una
copia de seguridad.** Prueba `evault:restore` contra una base de datos aparte de vez
en cuando, no el día que haga falta.

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

```bash
git pull && docker compose -f compose.yaml -f compose.deploy.yaml up -d --build
```

Las migraciones se aplican solas al arrancar. Los datos y el certificado están en
volúmenes y sobreviven a la recreación de los contenedores — comprobado
destruyéndolos y recreándolos, no suponiéndolo.

Haz un backup antes de actualizar. No porque se espere que falle, sino porque es
cuando toca.

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
