"""Fetch a public web page safely: timeouts, size limits, no private/link-local hosts."""
from __future__ import annotations

import concurrent.futures
import ipaddress
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

TIMEOUT_SECONDS = 5.0
MAX_BYTES = 100_000
MAX_REDIRECTS = 3
MAX_TEXT = 8_000


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ARG002
        if tag in {"script", "style", "noscript"}:
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip:
            text = " ".join(data.split())
            if text:
                self._chunks.append(text)

    def text(self) -> str:
        return " ".join(self._chunks)


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def public_hostname(host: str) -> bool:
    host = (host or "").strip().rstrip(".").lower()
    if not host or host in {"localhost", "localhost.localdomain"}:
        return False
    try:
        ipaddress.ip_address(host)
        return _is_public_ip(host)
    except ValueError:
        pass
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            infos = pool.submit(socket.getaddrinfo, host, None).result(timeout=2.0)
    except (socket.gaierror, TimeoutError, concurrent.futures.TimeoutError, OSError):
        return False
    addrs = {info[4][0] for info in infos}
    return bool(addrs) and all(_is_public_ip(ip) for ip in addrs)


def _normalize_url(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    if "://" not in text:
        text = "https://" + text
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    if not public_hostname(parsed.hostname):
        return None
    return parsed.geturl()


def _html_to_text(body: str) -> str:
    parser = _TextExtractor()
    try:
        parser.feed(body)
        parser.close()
    except Exception:
        return " ".join(body.split())[:MAX_TEXT]
    return parser.text()[:MAX_TEXT]


async def fetch_public_page(url: str) -> str | None:
    """Return visible text from a public page, or None if it can't be fetched safely."""
    current = _normalize_url(url)
    if not current:
        return None
    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT_SECONDS,
            follow_redirects=False,
            headers={"User-Agent": "BuboMap/1.0 (capability-map suggestion)"},
        ) as client:
            for _ in range(MAX_REDIRECTS + 1):
                response = await client.get(current)
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    current = _normalize_url(location) if location else None
                    if not current:
                        return None
                    continue
                if response.status_code >= 400:
                    return None
                content_type = (response.headers.get("content-type") or "").lower()
                if "html" not in content_type and "text/plain" not in content_type:
                    return None
                body = response.content[:MAX_BYTES].decode(response.encoding or "utf-8", errors="replace")
                return _html_to_text(body) or None
    except (httpx.HTTPError, OSError, ValueError):
        return None
    return None
