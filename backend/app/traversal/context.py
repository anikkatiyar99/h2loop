from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .traverser import CTraverser

from .mermaid_builder import MermaidBuilder


@dataclass
class TraversalContext:
    func_name: str
    builder: MermaidBuilder
    traverser: "CTraverser | None" = field(default=None, repr=False)
    break_stack: list[str] = field(default_factory=list)
    continue_stack: list[str] = field(default_factory=list)
