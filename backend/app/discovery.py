"""LAN discovery beacon.

The Android app has no way to learn the PC's IP address on its own, so the
backend announces itself on the local network with a small UDP broadcast. The
payload is JSON and carries no secrets — only the HTTP port and a hostname.

Protocol: one UDP datagram per announcement, JSON with at least
``{"app": "nrnmusic", "port": <http port>, "name": "<hostname>"}``.
"""

from __future__ import annotations

import json
import logging
import socket
import threading

log = logging.getLogger("nrnmusic.discovery")

BEACON_MAGIC = "nrnmusic"


def local_ips() -> list[str]:
    """IPv4 addresses of this machine, excluding loopback."""
    ips: set[str] = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass

    # Works even when the hostname does not resolve: ask the kernel which
    # source address it would use for outbound traffic.
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        ips.add(probe.getsockname()[0])
    except OSError:
        pass
    finally:
        probe.close()

    return sorted(ip for ip in ips if ip and not ip.startswith("127."))


def directed_broadcast(ip: str) -> str | None:
    parts = ip.split(".")
    if len(parts) != 4:
        return None
    return ".".join(parts[:3] + ["255"])


def beacon_payload(port: int) -> bytes:
    payload = {"app": BEACON_MAGIC, "port": port, "name": socket.gethostname()}
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class DiscoveryBeacon:
    """Sends a UDP broadcast every ``interval`` seconds until stopped."""

    def __init__(self, port: int, interval: float = 2.0) -> None:
        self.port = port
        self.interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="nrn-discovery", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None

    def targets(self) -> list[str]:
        found = {"255.255.255.255"}
        for ip in local_ips():
            broadcast = directed_broadcast(ip)
            if broadcast:
                found.add(broadcast)
        return sorted(found)

    def send_once(self) -> None:
        payload = beacon_payload(self.port)
        for target in self.targets():
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                    sock.settimeout(0.5)
                    sock.sendto(payload, (target, self.port))
            except OSError as exc:  # interface down / no route — keep trying
                log.debug("beacon to %s failed: %s", target, exc)

    def _run(self) -> None:
        log.info("discovery beacon listening out on udp/%s", self.port)
        while not self._stop.is_set():
            self.send_once()
            self._stop.wait(self.interval)
