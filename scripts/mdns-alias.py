#!/usr/bin/env python3
"""Publishes mDNS aliases against the local avahi, for a local-network deployment.

Why it exists
-------------
Avahi announces the machine's name —`kastor.local`— and nothing else. An eVault
deployment needs TWO origins, the SPA and the API, so two names resolving to the
same machine are needed. That is what this script publishes.

It talks to `org.freedesktop.Avahi` over D-Bus directly, which is what
`avahi-publish` does underneath, and that way it does not force installing
`avahi-utils`.

An mDNS limitation worth knowing before choosing names
------------------------------------------------------
**The names have to be of ONE single label under `.local`.** `evault.local`
resolves; `api.evault.local` does NOT, even though avahi publishes it without
protesting and without giving any error. Resolvers do not query multi-label names
over mDNS, so the record exists and nobody asks for it. Checked while preparing
issue #159, and it is the reason the names are `evault.local` and
`evault-api.local` instead of `app.evault.local` and `api.evault.local`.

The records live as long as this process lives: when the D-Bus connection closes,
avahi releases the group. That is why it runs as a service and not as a loose
command. See docs/operations/DEPLOYMENT.md.

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
    """The IP this machine reaches the local network with.

    It is worked out by opening a UDP socket outwards —which sends nothing— instead
    of reading the first interface that shows up: on a server with Docker there are
    several, and `docker0` would answer with an address nobody on the network can
    reach.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(('192.0.2.1', 9))  # TEST-NET-1: not routed, no traffic goes out
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
