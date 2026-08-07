#!/usr/bin/env python3
"""Publica alias mDNS contra el avahi local, para un despliegue en red local.

Por qué existe
--------------
Avahi anuncia el nombre de la máquina —`kastor.local`— y nada más. Un despliegue
de eVault necesita DOS orígenes, la SPA y la API, así que hacen falta dos nombres
que resuelvan a la misma máquina. Eso es lo que publica este script.

Habla directamente con `org.freedesktop.Avahi` por D-Bus, que es lo que hace
`avahi-publish` por dentro, y así no obliga a instalar `avahi-utils`.

Una limitación de mDNS que conviene saber antes de elegir nombres
-----------------------------------------------------------------
**Los nombres han de ser de UNA sola etiqueta bajo `.local`.** `evault.local`
resuelve; `api.evault.local` NO, aunque avahi lo publique sin protestar y sin dar
ningún error. Los resolvedores no consultan por mDNS los nombres multietiqueta, de
modo que el registro existe y nadie lo pregunta. Comprobado al preparar el issue
#159, y es la razón de que los nombres sean `evault.local` y `evault-api.local` en
vez de `app.evault.local` y `api.evault.local`.

Los registros viven mientras viva este proceso: al cerrarse la conexión D-Bus,
avahi libera el grupo. Por eso corre como servicio y no como un comando suelto.
Ver docs/operations/DEPLOYMENT.md.

    ./scripts/mdns-alias.py evault.local evault-api.local
    ./scripts/mdns-alias.py --ip 192.168.1.42 evault.local
"""

import argparse
import signal
import socket
import sys

import dbus
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

IF_UNSPEC, PROTO_UNSPEC = -1, -1
CLASS_IN, TYPE_A = 0x01, 0x01
TTL = 60


def local_address() -> str:
    """La IP con la que esta máquina sale a la red local.

    Se averigua abriendo un socket UDP hacia fuera —que no envía nada— en vez de
    leer la primera interfaz que aparezca: en un servidor con Docker hay varias, y
    `docker0` respondería con una dirección que nadie de la red puede alcanzar.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(('192.0.2.1', 9))  # TEST-NET-1: no se enruta, no sale tráfico
        return s.getsockname()[0]


def publish(ip: str, names: list[str]) -> None:
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    server = dbus.Interface(
        bus.get_object('org.freedesktop.Avahi', '/'), 'org.freedesktop.Avahi.Server'
    )
    group = dbus.Interface(
        bus.get_object('org.freedesktop.Avahi', server.EntryGroupNew()),
        'org.freedesktop.Avahi.EntryGroup',
    )

    for name in names:
        if name.count('.') != 1:
            print(
                f'aviso: «{name}» no es de una sola etiqueta bajo .local, '
                'así que se publicará pero nadie lo resolverá',
                file=sys.stderr,
            )
        group.AddRecord(
            IF_UNSPEC,
            PROTO_UNSPEC,
            dbus.UInt32(0),
            name,
            CLASS_IN,
            TYPE_A,
            TTL,
            [int(octet) for octet in ip.split('.')],
        )
        print(f'{name} -> {ip}', flush=True)

    group.Commit()

    loop = GLib.MainLoop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        GLib.unix_signal_add(GLib.PRIORITY_HIGH, sig, lambda: loop.quit() or True)
    loop.run()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('names', nargs='+', metavar='NOMBRE.local')
    parser.add_argument(
        '--ip',
        help='dirección a publicar; por defecto, la de salida a la red local',
    )
    args = parser.parse_args()

    ip = args.ip or local_address()
    try:
        publish(ip, args.names)
    except dbus.DBusException as error:
        print(f'error hablando con avahi: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
