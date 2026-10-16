#!/usr/bin/env python3
"""Validate the generated homepage counter and CV academic path."""

from __future__ import annotations

import sys
import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path


EXPECTED_STAGES = {
    "whu": {"start": "2019-09-01", "end": "2023-06-30"},
    "ucas": {"start": "2023-09-01", "end": ""},
    "nus": {"start": "2026-09-01", "end": "2027-08-31"},
}


class FeatureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.counter: dict[str, str] = {}
        self.academic_path: dict[str, str] = {}
        self.academic_stages: dict[str, dict[str, str]] = {}
        self.assets: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        classes = set(attributes.get("class", "").split())

        if "data-visitor-counter" in attributes:
            self.counter = attributes

        if "data-academic-path" in attributes:
            self.academic_path = attributes

        if attributes.get("data-academic-stage"):
            self.academic_stages[attributes["data-academic-stage"]] = attributes

        if tag == "link" and attributes.get("href"):
            self.assets.add(attributes["href"])
        if tag == "script" and attributes.get("src"):
            self.assets.add(attributes["src"])


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def validate_home(path: Path) -> None:
    require(path.is_file(), f"generated homepage not found: {path}")
    html = path.read_text(encoding="utf-8")
    parser = FeatureParser()
    parser.feed(html)

    require(parser.counter, "homepage visitor counter is missing")
    require(parser.counter.get("data-counter-since") == "Aug 2026", "visitor counter start label is incorrect")
    endpoint = parser.counter.get("data-counter-endpoint", "")
    require(
        endpoint == "https://zgj19stat-visitor-counter.zgj19stat.workers.dev",
        "visitor counter endpoint does not match the deployed Worker",
    )
    require("visitor-counter.css" in " ".join(parser.assets), "visitor counter stylesheet is missing")
    require("visitor-counter.js" in " ".join(parser.assets), "visitor counter script is missing")
    require("Total visits" in html and "Since Aug 2026" in html, "visitor counter labels are missing")
    require(
        "I am currently visiting the <a href=\"https://www.stat.nus.edu.sg/\">Department of Statistics and Data Science</a>"
        in html,
        "the homepage does not describe the NUS visit in the present tense",
    )
    news_heading = '<h2 id="recent-news">Recent news</h2>'
    require(html.count(news_heading) == 1, "the homepage Recent news heading is missing or duplicated")
    news_start = html.index(news_heading)
    counter_start = html.index("data-visitor-counter")
    require(news_start < counter_start, "Recent news must appear before the visitor counter")
    require("I am currently visiting" in html[:news_start], "About me must stay above Recent news")
    require("I will visit the" not in html[:news_start], "the About me NUS description must stay in the present tense")
    news_html = html[news_start:counter_start]
    news_items = re.findall(r"<li>(.*?)</li>", news_html, re.DOTALL)
    require(len(news_items) == 3, "Recent news must contain exactly the three requested updates")
    require(not re.search(r"<a\b", news_html, re.IGNORECASE), "Recent news must not contain hyperlinks")
    news_text = [" ".join(unescape(re.sub(r"<[^>]+>", "", item)).split()) for item in news_items]
    require(
        re.findall(r"<strong>(.*?)</strong>", news_html) == ["Oct. 2026", "Oct. 2026", "Aug. 2026"],
        "Recent news dates must appear in reverse chronological order",
    )
    require(
        "Our paper" in news_text[0]
        and "A Functional Latent Space Model for Time-varying Networks with Applications to Clinical Outcomes Data" in news_text[0]
        and "is accepted by Biometrics." in news_text[0],
        "the Biometrics acceptance news is incorrect",
    )
    require(
        news_text[1] == "Oct. 2026 I receive the National Scholarship for Doctoral Students.",
        "the doctoral scholarship news is incorrect",
    )
    require(
        news_text[2] == "Aug. 2026 I will be visiting Prof. Doudou Zhou in the Department of Statistics and Data Science at "
        "National University of Singapore from September 1, 2026 to August 31, 2027.",
        "the dated NUS visit announcement is incorrect",
    )


def validate_cv(path: Path) -> None:
    require(path.is_file(), f"generated CV page not found: {path}")
    html = path.read_text(encoding="utf-8")
    parser = FeatureParser()
    parser.feed(html)

    require(parser.academic_path.get("data-time-zone") == "Asia/Shanghai", "academic path time zone is incorrect")
    require(set(parser.academic_stages) == set(EXPECTED_STAGES), "academic path must contain WHU, UCAS, and NUS")

    for stage_id, expected in EXPECTED_STAGES.items():
        stage = parser.academic_stages[stage_id]
        require(stage.get("data-start-date") == expected["start"], f"{stage_id} start date is incorrect")
        require(stage.get("data-end-date", "") == expected["end"], f"{stage_id} end date is incorrect")
        require(stage.get("data-status") in {"completed", "current", "upcoming"}, f"{stage_id} status is invalid")

    require("academic-path.css" in " ".join(parser.assets), "academic path stylesheet is missing")
    require("academic-path.js" in " ".join(parser.assets), "academic path script is missing")
    require("Supervisor: <a href=\"https://people.ucas.edu.cn/~sgzhang?language=en\">Sanguo Zhang</a>" in html,
            "the newly added UCAS supervisor is missing")
    require("Host: <a href=\"https://doudouzhou.github.io/\">Doudou Zhou</a>" in html,
            "the NUS host is missing")
    require("Advanced Mathematical Statistics (Fall 2024, Fall 2025)" in html, "teaching content changed")
    award_items = [" ".join(item.split()) for item in re.findall(r"<li>(.*?)</li>", html, re.DOTALL)]
    for award in (
        "2026 National Scholarship for Doctoral Students",
        "2026 China Scholarship Council Scholarship, National Construction High-Level University Public Graduate Program",
    ):
        require(award_items.count(award) == 1, f"the exact simplified award is missing or duplicated: {award}")


def main() -> int:
    site_root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    validate_home(site_root / "index.html")
    validate_cv(site_root / "cv" / "index.html")
    print("Validated homepage Recent news, visit counter, and three-stage CV academic path.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"Validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
