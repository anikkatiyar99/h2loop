from __future__ import annotations

try:
    from ast_grep_py import SgNode
except ImportError:
    SgNode = object  # type: ignore[assignment,misc]

from . import _extract_name
from .context import TraversalContext
from .mermaid_builder import MermaidBuilder
from .visitors import REGISTRY, _node_id, _span, _truncate, _wire

MAX_NODES = 100


class CTraverser:
    def __init__(self) -> None:
        pass

    def traverse_function(self, fn_node: "SgNode") -> tuple[str, dict, int]:
        builder = MermaidBuilder()
        func_name = _extract_name(fn_node)
        ctx = TraversalContext(func_name=func_name, builder=builder)
        ctx.traverser = self

        start_id = f"start_{fn_node.range().start.index}"
        builder.add_node(start_id, f"{func_name}: start", "stadium")

        exits = self.traverse_statement(fn_node, ctx, [start_id])

        if exits:
            end_id = f"end_{fn_node.range().start.index}"
            builder.add_node(end_id, f"{func_name}: end", "stadium")
            for exit_id in exits:
                builder.add_edge(exit_id, end_id)

        count = builder.node_count()
        if count > MAX_NODES:
            return ("", {}, count)

        return (builder.render(), builder.get_span_map(), count)

    def traverse_statement(
        self,
        node: "SgNode",
        ctx: TraversalContext,
        entry_ids: list[str],
        edge_label: str = "",
    ) -> list[str]:
        visitor = REGISTRY.get(node.kind())
        if visitor:
            return visitor.visit(node, ctx, entry_ids, edge_label)
        return self._default(node, ctx, entry_ids, edge_label)

    def _default(
        self,
        node: "SgNode",
        ctx: TraversalContext,
        entry_ids: list[str],
        edge_label: str = "",
    ) -> list[str]:
        node_id = _node_id(node)
        text = _truncate(node.text() or node.kind())
        ctx.builder.add_node(node_id, text, "rect", _span(node))
        _wire(ctx.builder, entry_ids, node_id, edge_label)
        return [node_id]

