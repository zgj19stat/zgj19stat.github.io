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
        assert {a.get("hreflang") for a in alternates} >= {"en", "zh-CN", "x-default"}
        assert not re.search(r"\{[{%]", page.html), "unrendered Liquid"
        ids = [a["id"] for a in page.attrs("id")]
        assert len(ids) == len(set(ids)), "duplicate HTML IDs"
        cv = "CV_Chinese.pdf" if lang == "zh-CN" else "CV.pdf"
        assert any(a.get("href", "").endswith("/files/" + cv) for t, a in page.tags if t == "a")

en, zh = [Page(root / p / "index.html") for p in ("", "cn")]
for key in ("data-news-id", "data-service-id", "data-award-id", "data-academic-stage"):
    assert [a[key] for a in en.attrs(key)] == [a[key] for a in zh.attrs(key)]
assert len(zh.attrs("data-news-id")) == 3
assert len(zh.attrs("data-award-id")) == 9
for page, heading, role in ((en, "Academic Service", "Reviewer"), (zh, "学术服务", "审稿工作")):
    assert [a["data-service-id"] for a in page.attrs("data-service-id")] == ["aoas", "iclr-2027"]
    assert page.html.count('<h2 id="academic-service">' + heading + '</h2>') == 1
    service = re.search(r'<h2 id="academic-service">.*?</ul>', page.html, re.S).group()
    assert '<strong>' + role + '</strong>' in service
    assert '<em>The Annals of Applied Statistics (AOAS)</em>' in service
    assert '<em>International Conference on Learning Representations (ICLR)</em>, 2027' in service
    sections = ['id="recent-news"', 'id="academic-service"', 'id="teaching-experiences"', 'id="awards"']
    positions = [page.html.index(section) for section in sections]
    assert positions == sorted(positions)
for page in (en, zh):
    assert "Merit Student" not in page.html and "Graduate Student Research Forum" not in page.html
    news = re.search(r'<ul class="recent-news".*?</ul>', page.html, re.S).group()
    assert "<a " not in news
assert "教育经历" in zh.html and "教学经历" in zh.html
assert "中国科协青年人才培育工程博士生专项计划" in zh.html
assert "中国科协青年人才托举工程博士生专项计划" not in zh.html

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
assert hashlib.sha256((root / "files/CV.pdf").read_bytes()).hexdigest() == "2d3c61a9a23ec951aef938276c6bf95d9b7be5ca2bbce24958194c4bdb05965b", "English CV changed"
assert hashlib.sha256((root / "files/CV_Chinese.pdf").read_bytes()).hexdigest() == "c00bd024403b8b3edec9334df33e36db136e46526aa38ef22219bb28b02d1038", "Chinese CV changed"
print("PASS: six bilingual pages, navigation, shared records, map geometry, and PDF links")
