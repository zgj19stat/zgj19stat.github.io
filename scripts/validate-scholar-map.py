#!/usr/bin/env python3
"""Validate the generated Publications page without third-party packages."""

from __future__ import annotations

import sys
import math
import re
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
        "joint-disease-interconnections",
        "agent-cue",
    },
    "hub-community-detection": {
        "directed-hypergraphs",
        "distributed-hub-detection",
        "joint-disease-interconnections",
    },
    "multi-source-data": {
        "ladder",
        "distributed-hub-detection",
        "federated-class-incremental-learning",
        "conditional-generative-multisource",
    },
    "generalization": {
        "bad-genius-harness-evolution",
        "ladder",
    },
    "agent": {
        "agent-cue",
        "bad-genius-harness-evolution",
    },
}

EXPECTED_MAP_LABELS = {
    "ladder": "LADDER",
    "pattern-calibrated-multimodal-prediction": "MOSAIC",
    "information-transfer": "Transfer-Label-Noise",
    "federated-class-incremental-learning": "STSA",
    "conditional-generative-multisource": "STWGAN",
    "directed-hypergraphs": "FOLD",
    "distributed-hub-detection": "Distributed Hub",
    "functional-latent-space-model": "FLSM",
    "disease-network": "MTFLSM",
    "joint-disease-interconnections": "LUMEN",
    "bad-genius-harness-evolution": "CHASE",
    "agent-cue": "AgentCue",
}

EXPECTED_TIMELINE_LABELS = {
    "ladder": ("630", "87", "middle"),
    "pattern-calibrated-multimodal-prediction": ("630", "414", "middle"),
    "information-transfer": ("540", "374", "middle"),
    "federated-class-incremental-learning": ("450", "414", "middle"),
    "conditional-generative-multisource": ("90", "153", "middle"),
    "joint-disease-interconnections": ("705", "344", "end"),
    "directed-hypergraphs": ("660", "213", "middle"),
    "distributed-hub-detection": ("570", "213", "middle"),
    "functional-latent-space-model": ("705", "133", "end"),
    "disease-network": ("510", "153", "middle"),
    "agent-cue": ("705", "504", "end"),
    "bad-genius-harness-evolution": ("675", "449", "end"),
}


class PublicationPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.ids: list[str] = []
        self.paper_nodes: dict[str, dict[str, str]] = {}
        self.publication_items: dict[str, dict[str, str]] = {}
        self.hyperedges: dict[str, set[str]] = {}
        self.hyperedge_paths: dict[str, list[str]] = {}
        self.assets: set[str] = set()
        self.map_canvas: dict[str, str] = {}
        self.map_root: dict[str, str] = {}
        self.view_buttons: dict[str, dict[str, str]] = {}
        self.timeline_stems: set[str] = set()
        self.paper_hit_targets: list[dict[str, str]] = []
        self.paper_labels: dict[str, dict[str, dict[str, str]]] = {
            "themes": {},
            "timeline": {},
        }
        self.timeline_band: dict[str, str] = {}
        self.timeline_divider: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        classes = set(attributes.get("class", "").split())

        if attributes.get("id"):
            self.ids.append(attributes["id"])

        if tag == "g" and "research-hypergraph__paper" in classes:
            work_id = attributes.get("data-work-id", "")
            self.paper_nodes[work_id] = attributes

        if tag == "section" and "research-hypergraph" in classes:
            self.map_root = attributes

        if attributes.get("data-map-view-button"):
            self.view_buttons[attributes["data-map-view-button"]] = attributes

        if attributes.get("data-timeline-stem"):
            self.timeline_stems.add(attributes["data-timeline-stem"])

        if "data-research-map-canvas" in attributes:
            self.map_canvas = attributes

        if tag == "circle" and "research-hypergraph__paper-hit" in classes:
            self.paper_hit_targets.append(attributes)

        if tag == "text" and "research-hypergraph__paper-label" in classes:
            view = attributes.get("data-label-view", "")
            work_id = attributes.get("data-label-work-id", "")
            if view in self.paper_labels:
                self.paper_labels[view][work_id] = attributes

        if tag == "rect" and "research-hypergraph__timeline-band" in classes:
            self.timeline_band = attributes

        if tag == "line" and "research-hypergraph__timeline-divider" in classes:
            self.timeline_divider = attributes

        if tag == "li" and "publication-item" in classes:
            work_id = attributes.get("id", "")
            self.publication_items[work_id] = attributes

        if attributes.get("data-hyperedge-target"):
            edge_id = attributes["data-hyperedge-target"]
            self.hyperedges[edge_id] = set(attributes.get("data-members", "").split())

        edge_id = attributes.get("data-hyperedge-shape") or attributes.get("data-hyperedge-target")
        if edge_id:
            self.hyperedge_paths.setdefault(edge_id, []).append(attributes.get("d", ""))

        if tag == "link" and attributes.get("href"):
            self.assets.add(attributes["href"])
        if tag == "script" and attributes.get("src"):
            self.assets.add(attributes["src"])


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def validate_contours(parser: PublicationPageParser) -> None:
    """Check the rendered geometry, not just the declared theme memberships."""
    for edge_id, paths in parser.hyperedge_paths.items():
        require(len(paths) == 3 and len(set(paths)) == 1, f"{edge_id}: fill, line, and hover paths differ")
        tokens = re.findall(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)", paths[0])
        require(tokens[0] == "M" and tokens[-1] == "Z", f"{edge_id}: contour must be closed")
        require((len(tokens) - 4) % 7 == 0, f"{edge_id}: expected cubic contour segments")
        cursor = (float(tokens[1]), float(tokens[2]))
        segments = []
        for i in range(3, len(tokens) - 1, 7):
            require(tokens[i] == "C", f"{edge_id}: only absolute cubic segments are supported")
            segment = [cursor] + [(float(tokens[j]), float(tokens[j + 1])) for j in (i + 1, i + 3, i + 5)]
            segments.append(segment)
            cursor = segment[-1]
        require(len(segments) >= 4, f"{edge_id}: incomplete contour")

        # Periodic cubic splines match position, tangent, and second derivative,
        # including at the closing seam. Tolerances allow 3-decimal serialization.
        for a, b in zip(segments, segments[1:] + segments[:1]):
            require(math.dist(a[3], b[0]) < 0.002, f"{edge_id}: open contour seam")
            out_tangent = tuple(3 * (a[3][d] - a[2][d]) for d in (0, 1))
            in_tangent = tuple(3 * (b[1][d] - b[0][d]) for d in (0, 1))
            require(math.dist(out_tangent, in_tangent) < 0.02, f"{edge_id}: sharp tangent join")
            out_accel = tuple(6 * (a[3][d] - 2 * a[2][d] + a[1][d]) for d in (0, 1))
            in_accel = tuple(6 * (b[2][d] - 2 * b[1][d] + b[0][d]) for d in (0, 1))
            require(math.dist(out_accel, in_accel) < 0.06, f"{edge_id}: abrupt curvature join")

        points = []
        for a, b, c, d in segments:
            for step in range(60):
                t = step / 60
                s = 1 - t
                points.append(tuple(s**3*a[k] + 3*s*s*t*b[k] + 3*s*t*t*c[k] + t**3*d[k] for k in (0, 1)))
        require(all(8 < x < 742 and 8 < y < 542 for x, y in points), f"{edge_id}: clipped contour")
        lines = list(zip(points, points[1:] + points[:1]))

        def turn(a, b, c):
            return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])

        for i, (a, b) in enumerate(lines):
            for c, d in lines[i + 2:]:
                require(not (turn(a, b, c)*turn(a, b, d) < -1e-9 and turn(c, d, a)*turn(c, d, b) < -1e-9),
                        f"{edge_id}: self-intersecting contour")

        for work_id, attrs in parser.paper_nodes.items():
            x, y = float(attrs["data-theme-x"]), float(attrs["data-theme-y"])
            inside = False
            clearance = float("inf")
            for (ax, ay), (bx, by) in lines:
                if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
                    inside = not inside
                dx, dy = bx-ax, by-ay
                norm = dx*dx + dy*dy
                t = max(0, min(1, ((x-ax)*dx + (y-ay)*dy) / norm)) if norm else 0
                clearance = min(clearance, math.hypot(x-ax-t*dx, y-ay-t*dy))
            require(inside == (work_id in parser.hyperedges[edge_id]), f"{edge_id}: incorrect enclosure of {work_id}")
            require(clearance > 18, f"{edge_id}: contour too close to {work_id}")


def main() -> int:
    page_path = Path(sys.argv[1] if len(sys.argv) > 1 else "_site/publications/index.html")
    require(page_path.is_file(), f"generated page not found: {page_path}")

    html = page_path.read_text(encoding="utf-8")
    parser = PublicationPageParser()
    parser.feed(html)

    expected_work_ids = set().union(*EXPECTED_HYPEREDGES.values())
    require(len(expected_work_ids) == 12, "the expected hypergraph must contain twelve unique works")
    require(set(parser.paper_nodes) == expected_work_ids, "map nodes do not match the twelve expected works")
    require(set(parser.publication_items) == expected_work_ids, "publication entries do not match map nodes")
    require(parser.hyperedges == EXPECTED_HYPEREDGES, "generated hyperedge memberships are incorrect")
    require(sum(len(members) for members in parser.hyperedges.values()) == 21, "expected twenty-one node-hyperedge incidences")
    validate_contours(parser)

    stages = Counter(attributes.get("data-stage") for attributes in parser.paper_nodes.values())
    require(stages == {"manuscript": 9, "publication": 3}, f"unexpected map status counts: {stages}")

    map_labels = {work_id: attributes.get("data-map-label", "") for work_id, attributes in parser.paper_nodes.items()}
    require(map_labels == EXPECTED_MAP_LABELS, f"unexpected map labels: {map_labels}")
    require(parser.map_canvas.get("data-hit-radius") == "18", "the map must declare its contour hit radius")
    require(parser.map_root.get("data-map-view") == "themes", "the map must default to the themes view")
    require(set(parser.view_buttons) == {"themes", "timeline"}, "the map must expose Themes and Timeline controls")
    require(parser.view_buttons["themes"].get("aria-pressed") == "true", "Themes must be selected by default")
    require(parser.view_buttons["timeline"].get("aria-pressed") == "false", "Timeline must be unselected by default")
    require(parser.timeline_stems == expected_work_ids, "timeline stems do not match the twelve expected works")
    require(
        set(parser.paper_labels["themes"]) == expected_work_ids,
        "theme-view labels do not match the twelve expected works",
    )
    require(
        set(parser.paper_labels["timeline"]) == expected_work_ids,
        "timeline-view labels do not match the twelve expected works",
    )
    actual_timeline_labels = {
        work_id: (
            attributes.get("data-label-x", ""),
            attributes.get("data-label-y", ""),
            attributes.get("data-label-anchor", ""),
        )
        for work_id, attributes in parser.paper_labels["timeline"].items()
    }
    require(
        actual_timeline_labels == EXPECTED_TIMELINE_LABELS,
        f"timeline label layout changed unexpectedly: {actual_timeline_labels}",
    )
    require(
        parser.timeline_band.get("height") == "448"
        and parser.timeline_divider.get("y2") == "507",
        "the expanded timeline envelope is missing",
    )
    require(
        len(parser.paper_hit_targets) == 12 and all(target.get("r") == "16" for target in parser.paper_hit_targets),
        "each paper node must have a stable enlarged hit target",
    )
    require("research-hypergraph__area-headings" not in html, "redundant research-area headings remain in the map")

    for work_id, attributes in parser.paper_nodes.items():
        require(attributes.get("data-href") == f"#{work_id}", f"map node {work_id} has an invalid target")
        require(attributes.get("role") == "link", f"map node {work_id} must expose a link role")
        require(attributes.get("tabindex") == "0", f"map node {work_id} must be keyboard-focusable")
        require(attributes.get("aria-label"), f"map node {work_id} has no accessible label")
        require(attributes.get("data-timeline-date"), f"map node {work_id} has no timeline date")
        require(attributes.get("data-timeline-x", "").isdigit(), f"map node {work_id} has an invalid timeline x-coordinate")
        require(attributes.get("data-timeline-y", "").isdigit(), f"map node {work_id} has an invalid timeline y-coordinate")

    duplicate_ids = sorted(identifier for identifier, count in Counter(parser.ids).items() if count > 1)
    require(not duplicate_ids, f"duplicate HTML ids: {duplicate_ids}")

    require("&lt;/sup&gt;" not in html, "escaped closing sup tag is visible in generated HTML")
    require("<sup><em>" not in html, "author mark was incorrectly parsed as emphasis")
    require(
        "Joint Latent Space Modeling of Time-Varying Disease Interconnections and Trends: "
        "Analysis of the Taiwan Health Insurance Research Database" in html,
        "the LUMEN working-paper title is missing",
    )
    lumen_start = html.index('<li id="joint-disease-interconnections"')
    lumen_end = html.index("</li>", lumen_start)
    lumen_entry = html[lumen_start:lumen_end]
    require("Manuscript, Oct. 2026." in lumen_entry, "the LUMEN manuscript status or date is missing")
    require("Working Paper" not in lumen_entry, "the old LUMEN working-paper label remains")
    require("Manuscript · Oct 2026" in html, "the LUMEN map metadata is not updated")
    require(
        parser.paper_nodes["joint-disease-interconnections"].get("data-timeline-date") == "Oct 2026",
        "the LUMEN timeline date is not updated",
    )
    require(
        "Bad Genius: Counterfactual-Guided Harness Evolution Beyond Task-Specific Shortcuts" in html,
        "the CHASE manuscript title is missing",
    )
    require(
        "AgentCue: Statistical Summaries for Guiding Decentralized Multi-Agent Self-Organization" in html,
        "the AgentCue manuscript title is missing",
    )
    require('<h2 id="agent-research">Agent Research</h2>' in html, "the Agent Research area is missing")
    require(
        "Agent evaluation, Harness evolution, Multi-Agent System." in html,
        "the Agent Research subtitle is missing",
    )
    chase_start = html.index('<li id="bad-genius-harness-evolution"')
    chase_end = html.index("</li>", chase_start)
    chase_entry = html[chase_start:chase_end]
    require("Under review, Sep. 2026." in chase_entry, "the CHASE review status or date is missing")
    require("Under review · Sep 2026" in html, "the CHASE map metadata is not updated")
    require("ICLR" not in chase_entry, "the CHASE entry must not expose its submission venue")
    require(
        chase_entry.count('href="https://arxiv.org/abs/2609.18366"') == 1,
        "the CHASE entry must expose exactly one official arXiv link",
    )
    require(">arXiv</a>" in chase_entry, "the CHASE arXiv link label is missing")

    agent_cue_start = html.index('<li id="agent-cue"')
    agent_cue_end = html.index("</li>", agent_cue_start)
    agent_cue_entry = html[agent_cue_start:agent_cue_end]
    require("Manuscript, Oct. 2026." in agent_cue_entry, "the AgentCue manuscript date is missing")
    require("Manuscript · Oct 2026" in html, "the AgentCue map metadata is missing")
    require(
        parser.paper_nodes["agent-cue"].get("data-theme-x") == "148"
        and parser.paper_nodes["agent-cue"].get("data-theme-y") == "422",
        "AgentCue must remain in the lower-left map region",
    )
    require(
        parser.paper_nodes["agent-cue"].get("data-timeline-date") == "Oct 2026",
        "the AgentCue timeline date is incorrect",
    )

    fold_start = html.index('<li id="directed-hypergraphs"')
    fold_end = html.index("</li>", fold_start)
    fold_entry = html[fold_start:fold_end]
    require("Under review, Aug. 2026." in fold_entry, "the FOLD review status or date is missing")
    require("Under review · Aug 2026" in html, "the FOLD map metadata is not updated")

    flsm_start = html.index('<li id="functional-latent-space-model"')
    flsm_end = html.index("</li>", flsm_start)
    flsm_entry = html[flsm_start:flsm_end]
    require("Accepted by <em>Biometrics</em>, Oct. 2026." in flsm_entry, "the FLSM acceptance is missing")
    require("Accepted by Biometrics · Oct 2026" in html, "the FLSM map metadata is not updated")
    require(
        parser.paper_nodes["functional-latent-space-model"].get("data-timeline-date") == "Oct 2026",
        "the FLSM timeline date is not updated",
    )

    require(
        "Twelve works can be explored as six overlapping research-theme contours" in html,
        "the map description does not match its twelve works and six themes",
    )
    require("From Jan 2025 to Oct 2026" in html, "the timeline range is not updated")
    require(html.count('aria-label="Corresponding author"') == 11, "unexpected number of corresponding-author marks")
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
