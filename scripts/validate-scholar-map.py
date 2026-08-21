#!/usr/bin/env python3
"""Validate the generated Publications page without third-party packages."""

from __future__ import annotations

import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


EXPECTED_HYPEREDGES = {
    "transfer-learning": {
        "pattern-calibrated-multimodal-prediction",
        "distributed-hub-detection",
        "information-transfer",
        "federated-class-incremental-learning",
        "conditional-generative-multisource",
    },
    "latent-space-model": {
        "functional-latent-space-model",
        "directed-hypergraphs",
        "disease-network",
    },
    "hub-community-detection": {
        "directed-hypergraphs",
        "distributed-hub-detection",
    },
    "multi-source-data": {
        "ladder",
        "distributed-hub-detection",
        "federated-class-incremental-learning",
        "conditional-generative-multisource",
    },
}


class PublicationPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.ids: list[str] = []
        self.paper_nodes: dict[str, dict[str, str]] = {}
        self.publication_items: dict[str, dict[str, str]] = {}
        self.hyperedges: dict[str, set[str]] = {}
        self.assets: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        classes = set(attributes.get("class", "").split())

        if attributes.get("id"):
            self.ids.append(attributes["id"])

        if tag == "g" and "research-hypergraph__paper" in classes:
            work_id = attributes.get("data-work-id", "")
            self.paper_nodes[work_id] = attributes

        if tag == "li" and "publication-item" in classes:
            work_id = attributes.get("id", "")
            self.publication_items[work_id] = attributes

        if attributes.get("data-hyperedge-target"):
            edge_id = attributes["data-hyperedge-target"]
            self.hyperedges[edge_id] = set(attributes.get("data-members", "").split())

        if tag == "link" and attributes.get("href"):
            self.assets.add(attributes["href"])
        if tag == "script" and attributes.get("src"):
            self.assets.add(attributes["src"])


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    page_path = Path(sys.argv[1] if len(sys.argv) > 1 else "_site/publications/index.html")
    require(page_path.is_file(), f"generated page not found: {page_path}")

    html = page_path.read_text(encoding="utf-8")
    parser = PublicationPageParser()
    parser.feed(html)

    expected_work_ids = set().union(*EXPECTED_HYPEREDGES.values())
    require(len(expected_work_ids) == 9, "the expected hypergraph must contain nine unique works")
    require(set(parser.paper_nodes) == expected_work_ids, "map nodes do not match the nine expected works")
    require(set(parser.publication_items) == expected_work_ids, "publication entries do not match map nodes")
    require(parser.hyperedges == EXPECTED_HYPEREDGES, "generated hyperedge memberships are incorrect")
    require(sum(len(members) for members in parser.hyperedges.values()) == 14, "expected fourteen node-hyperedge incidences")

    stages = Counter(attributes.get("data-stage") for attributes in parser.paper_nodes.values())
    require(stages == {"manuscript": 6, "publication": 3}, f"unexpected map status counts: {stages}")

    for work_id, attributes in parser.paper_nodes.items():
        require(attributes.get("data-href") == f"#{work_id}", f"map node {work_id} has an invalid target")
        require(attributes.get("role") == "link", f"map node {work_id} must expose a link role")
        require(attributes.get("tabindex") == "0", f"map node {work_id} must be keyboard-focusable")
        require(attributes.get("aria-label"), f"map node {work_id} has no accessible label")

    duplicate_ids = sorted(identifier for identifier, count in Counter(parser.ids).items() if count > 1)
    require(not duplicate_ids, f"duplicate HTML ids: {duplicate_ids}")

    require("&lt;/sup&gt;" not in html, "escaped closing sup tag is visible in generated HTML")
    require("<sup><em>" not in html, "author mark was incorrectly parsed as emphasis")
    require(html.count('aria-label="Corresponding author"') == 8, "unexpected number of corresponding-author marks")
    require("research-hypergraph.css" in " ".join(parser.assets), "research map stylesheet is missing")
    require("research-hypergraph.js" in " ".join(parser.assets), "research map script is missing")

    print(
        "Validated Publications page: "
        f"{len(parser.paper_nodes)} nodes, {len(parser.hyperedges)} hyperedges, "
        f"{sum(len(members) for members in parser.hyperedges.values())} incidences."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"Validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
