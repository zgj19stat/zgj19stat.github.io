#!/usr/bin/env python3
"""Regression checks for paired routes and shared, unchanged research records."""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import re
import sys


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.html = path.read_text(encoding="utf-8")
        self.tags = []
        self.feed(self.html)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def attrs(self, key):
        return [attrs for _, attrs in self.tags if key in attrs]


root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
pairs = [("", "cn"), ("talks", "cn/talks"), ("publications", "cn/publications")]
for en_path, zh_path in pairs:
    en = Page(root / en_path / "index.html")
    zh = Page(root / zh_path / "index.html")
    for page, lang, other in [(en, "en", "/" + zh_path + "/"), (zh, "zh-CN", "/" + en_path + "/" if en_path else "/")]:
        assert next(a for t, a in page.tags if t == "html")["lang"] == lang
        assert len(page.attrs("data-language-switch")) == 1
        assert page.attrs("data-language-switch")[0]["href"].endswith(other)
        alternates = [a for t, a in page.tags if t == "link" and a.get("rel") == "alternate"]
        assert {a["hreflang"] for a in alternates} >= {"en", "zh-CN", "x-default"}
        assert not re.search(r"\{[{%]", page.html), "unrendered Liquid"
        ids = [a["id"] for a in page.attrs("id")]
        assert len(ids) == len(set(ids)), "duplicate HTML IDs"
        cv = "CV_Chinese.pdf" if lang == "zh-CN" else "CV.pdf"
        assert any(a.get("href", "").endswith("/files/" + cv) for t, a in page.tags if t == "a")

en, zh = [Page(root / p / "index.html") for p in ("", "cn")]
for key in ("data-news-id", "data-award-id", "data-academic-stage"):
    assert [a[key] for a in en.attrs(key)] == [a[key] for a in zh.attrs(key)]
assert len(zh.attrs("data-news-id")) == 3
assert len(zh.attrs("data-award-id")) == 9
for page in (en, zh):
    assert "Merit Student" not in page.html and "Graduate Student Research Forum" not in page.html
    news = re.search(r'<ul class="recent-news".*?</ul>', page.html, re.S).group()
    assert "<a " not in news
assert "教育经历" in zh.html and "教学经历" in zh.html

en, zh = [Page(root / p / "index.html") for p in ("talks", "cn/talks")]
assert [a["data-talk-id"] for a in en.attrs("data-talk-id")] == [a["data-talk-id"] for a in zh.attrs("data-talk-id")]
assert len(en.attrs("data-talk-id")) == 5
english_talks = re.findall(r'<li[^>]*data-talk-id[^>]*>(.*?)</li>', en.html, re.S)
assert not re.search(r"[\u4e00-\u9fff]", "".join(english_talks)), "Chinese remains in English talk entries"

en, zh = [Page(root / p / "index.html") for p in ("publications", "cn/publications")]
for key in ("data-work-id", "data-hyperedge-shape", "data-timeline-stem"):
    assert en.attrs(key) == zh.attrs(key), f"map geometry/metadata differs: {key}"
entries = lambda p: re.findall(r'<li id="[^"]+" class="publication-item".*?</li>', p.html, re.S)
assert len(entries(en)) == 12 and entries(en) == entries(zh)
for name in ("CV.pdf", "CV_Chinese.pdf"):
    assert (root / "files" / name).read_bytes().startswith(b"%PDF-")
assert hashlib.sha256((root / "files/CV.pdf").read_bytes()).hexdigest() == "b380bd9b62c1f3684014211a684cfae81e90cf7369f78a5b685e3621928d0883", "English CV changed"
print("PASS: six bilingual pages, navigation, shared records, map geometry, and PDF links")
