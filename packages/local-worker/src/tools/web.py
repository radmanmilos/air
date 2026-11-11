"""Web tools: search + fetch."""
from __future__ import annotations

import urllib.request
from html.parser import HTMLParser

try:
    from duckduckgo_search import DDGS
    _HAS_DDGS = True
except Exception:
    _HAS_DDGS = False


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if t:
                self.parts.append(t)


def web_search(query: str, max_results: int = 8) -> str:
    if not _HAS_DDGS:
        return "ERROR: duckduckgo-search not installed"
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        return f"ERROR: search failed: {e}"
    lines = []
    for r in results:
        lines.append(f"- {r.get('title','')}\n  {r.get('href','')}\n  {r.get('body','')[:300]}")
    return "\n".join(lines) if lines else "(no results)"


def web_fetch(url: str, max_chars: int = 12000) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return f"ERROR: fetch failed: {e}"
    parser = _TextExtractor()
    try:
        parser.feed(raw)
    except Exception:
        pass
    text = " ".join(parser.parts)
    if len(text) > max_chars:
        text = text[:max_chars] + f"\n...[truncated, {len(text)} total chars]"
    return text or "(empty page)"
