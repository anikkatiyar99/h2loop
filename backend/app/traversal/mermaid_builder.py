from __future__ import annotations

import textwrap

_MERMAID_ESCAPES = str.maketrans(
    {
        "&": "&amp;",
        '"': "&quot;",
        "<": "&lt;",
        ">": "&gt;",
        "|": "&#124;",
    }
)


def _escape(label: str) -> str:
    return "<br/>".join(line.translate(_MERMAID_ESCAPES) for line in label.split("\n"))


def _wrap_label(label: str, shape: str) -> str:
    if not label.strip():
        return label

    line_width = {
        "diamond": 24,
        "loop_diamond": 24,
        "stadium": 28,
        "junction": 8,
    }.get(shape, 32)

    wrapped_lines: list[str] = []
    for chunk in label.split("\n"):
        if not chunk:
            continue
        wrapped = textwrap.wrap(
            chunk,
            width=line_width,
            break_long_words=True,
            break_on_hyphens=False,
        )
        wrapped_lines.extend(wrapped or [chunk])

    lines = wrapped_lines[:4]
    if len(wrapped_lines) > 4:
        lines[-1] = lines[-1] + "..."
    return "\n".join(lines)


def _shape(shape: str, label: str) -> str:
    safe = _escape(_wrap_label(label, shape)) if label.strip() else "\u00a0"
    if shape in {"diamond", "loop_diamond"}:
        return '{"' + safe + '"}'
    if shape == "stadium":
        return '(["' + safe + '"])'
    if shape == "junction":
        return '(("' + safe + '"))'
    return '["' + safe + '"]'


class MermaidBuilder:
    def __init__(self) -> None:
        self._lines: list[str] = []
        self._edges: list[str] = []
        self._span_map: dict[str, list[int]] = {}
        self._node_classes: list[tuple[str, str]] = []
        self._node_count: int = 0

    def add_node(
        self,
        node_id: str,
        label: str,
        shape: str = "rect",
        span: tuple[int, int] | None = None,
    ) -> str:
        self._lines.append(f"    {node_id}{_shape(shape, label)}")
        self._node_count += 1
        if shape in {"rect", "diamond", "loop_diamond", "stadium", "junction"}:
            self._node_classes.append((node_id, shape))
        if span is not None:
            self._span_map[node_id] = list(span)
        return node_id

    def add_edge(self, src: str, dst: str, label: str = "") -> None:
        if label:
            self._edges.append(f"    {src} -->|{_escape(label)}| {dst}")
        else:
            self._edges.append(f"    {src} --> {dst}")

    def node_count(self) -> int:
        return self._node_count

    def render(self) -> str:
        class_defs = [
            "    classDef rect fill:#172033,stroke:#4f89c6,color:#e5edf7,stroke-width:1.3px;",
            "    classDef diamond fill:#2b1d0a,stroke:#f59e0b,color:#fde68a,stroke-width:1.5px;",
            "    classDef loop_diamond fill:#0a1d2b,stroke:#06b6d4,color:#a5f3fc,stroke-width:2px;",
            "    classDef stadium fill:#083344,stroke:#22d3ee,color:#ecfeff,stroke-width:1.5px;",
            "    classDef junction fill:#1f2937,stroke:#94a3b8,color:#cbd5e1,stroke-width:1.2px;",
        ]
        class_uses = [f"    class {node_id} {class_name};" for node_id, class_name in self._node_classes]
        return "flowchart TD\n" + "\n".join(self._lines + self._edges + class_defs + class_uses)

    def get_span_map(self) -> dict[str, list[int]]:
        return dict(self._span_map)

