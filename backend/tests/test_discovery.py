"""UDP discovery beacon tests."""

from __future__ import annotations

import json
import socket

from app.discovery import BEACON_MAGIC, DiscoveryBeacon, beacon_payload, directed_broadcast, local_ips


def test_beacon_payload_is_json_with_magic_and_port() -> None:
    raw = beacon_payload(8000)
    data = json.loads(raw.decode("utf-8"))
    assert data["app"] == BEACON_MAGIC
    assert data["port"] == 8000
    assert isinstance(data["name"], str)


def test_directed_broadcast_replaces_last_octet() -> None:
    assert directed_broadcast("192.168.1.42") == "192.168.1.255"
    assert directed_broadcast("10.0.0.7") == "10.0.0.255"


def test_local_ips_excludes_loopback() -> None:
    for ip in local_ips():
        assert not ip.startswith("127.")


def test_beacon_sends_to_a_local_listener() -> None:
    receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    receiver.bind(("127.0.0.1", 0))
    port = receiver.getsockname()[1]
    receiver.settimeout(2)

    beacon = DiscoveryBeacon(port=port, interval=0.1)
    original_targets = beacon.targets
    beacon.targets = lambda: ["127.0.0.1"]  # type: ignore[method-assign]
    beacon.send_once()
    beacon.targets = original_targets  # type: ignore[method-assign]

    data, _ = receiver.recvfrom(1024)
    payload = json.loads(data.decode("utf-8"))
    assert payload["app"] == BEACON_MAGIC
    assert payload["port"] == port
    receiver.close()
