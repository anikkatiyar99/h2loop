from __future__ import annotations

import textwrap
from typing import Protocol, runtime_checkable

try:
    from ast_grep_py import SgNode
except ImportError:
    SgNode = object  # type: ignore[assignment,misc]

from .context import TraversalContext
from .mermaid_builder import MermaidBuilder


@runtime_checkable
class Visitor(Protocol):
    kind: str

    def visit(self, node: "SgNode", ctx: "TraversalContext", entry_ids: list[str], edge_label: str = "") -> list[str]: ...


def _node_id(node: "SgNode") -> str:
    return f"{node.kind()}_{node.range().start.index}"


def _truncate(text: str, max_len: int = 96) -> str:
    text = " ".join(text.strip().split())
    if len(text) > max_len:
        text = text[: max_len - 3].rstrip() + "..."
    wrapped = textwrap.wrap(
        text,
        width=44,
        break_long_words=True,
        break_on_hyphens=False,
    )
    return "\n".join(wrapped[:3]) if wrapped else text


def _span(node: "SgNode") -> tuple[int, int]:
    r = node.range()
    return (r.start.line, r.end.line)


def _wire(builder: MermaidBuilder, entry_ids: list[str], dst: str, label: str = "") -> None:
    for src in entry_ids:
        builder.add_edge(src, dst, label)


class CompoundStatementVisitor:
    kind = "compound_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        named = [c for c in node.children() if c.is_named()]
        if not named:
            return entry_ids
        traverser = ctx.traverser
        # Skip leading comments so the edge_label is carried forward to the
        # first real statement rather than being silently dropped.
        pending_label = edge_label
        current_exits = entry_ids
        for child in named:
            if not current_exits:
                break
            current_exits = traverser.traverse_statement(child, ctx, current_exits, pending_label)
            # Once the label has been consumed by a real (non-comment) node,
            # clear it so subsequent siblings don't inherit it.
            if child.kind() != "comment":
                pending_label = ""
        return current_exits


class FunctionDefinitionVisitor:
    kind = "function_definition"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        body = node.field("body")
        if body is None:
            return entry_ids
        return ctx.traverser.traverse_statement(body, ctx, entry_ids, edge_label)


class IfStatementVisitor:
    kind = "if_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        b = ctx.builder
        base = node.range().start.index
        cond_node = node.field("condition")
        cond_text = "if: " + (cond_node.text() if cond_node else "condition")
        diamond_id = _node_id(node)
        b.add_node(diamond_id, _truncate(cond_text), "diamond", _span(node))
        _wire(b, entry_ids, diamond_id, edge_label)

        consequence = node.field("consequence")
        true_exits: list[str] = []
        if consequence:
            true_exits = traverser.traverse_statement(consequence, ctx, [diamond_id], "Yes")
        else:
            true_exits = [diamond_id]

        alternative = node.field("alternative")
        false_exits: list[str] = []
        if alternative:
            # else / else-if — traverse into the alternative branch
            false_exits = traverser.traverse_statement(alternative, ctx, [diamond_id], "No")
        else:
            # No else branch — the false edge is a live exit that bypasses the true branch
            false_exits = [diamond_id]

        all_exits = true_exits + false_exits

        # Only emit a merge node when there are multiple live paths converging,
        # or when the diamond itself is still a live exit (no-else case).
        # If every branch terminated (return/break/continue), skip the merge entirely.
        needs_merge = len(all_exits) > 1 or (not alternative and diamond_id in all_exits)

        if not needs_merge:
            # All branches terminated — nothing flows out of this if block
            return []

        merge_id = f"merge_{base}"
        b.add_node(merge_id, "", "junction")

        if not alternative:
            # No else: true branch exits + diamond's false edge both go to merge
            b.add_edge(diamond_id, merge_id, "No")
            for exit_id in true_exits:
                b.add_edge(exit_id, merge_id)
        else:
            for exit_id in all_exits:
                b.add_edge(exit_id, merge_id)

        return [merge_id]


class ElseClauseVisitor:
    kind = "else_clause"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        b = ctx.builder
        named = [c for c in node.children() if c.is_named()]
        if not named:
            return entry_ids

        first = named[0]
        # If this is an "else if", insert a small junction between the incoming
        # "No" edge and the nested if-diamond. Without it, Mermaid renders the
        # incoming label directly on the diamond node and drops the outgoing
        # Yes/No labels because a node cannot display both at once.
        if first.kind() == "if_statement":
            junc_id = f"elseif_junc_{node.range().start.index}"
            b.add_node(junc_id, "", "junction")
            _wire(b, entry_ids, junc_id, edge_label)
            current = traverser.traverse_statement(first, ctx, [junc_id])
        else:
            current = traverser.traverse_statement(first, ctx, entry_ids, edge_label)

        for child in named[1:]:
            if not current:
                break
            current = traverser.traverse_statement(child, ctx, current)
        return current


class ForStatementVisitor:
    kind = "for_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        b = ctx.builder
        base = node.range().start.index

        init_node = node.field("initializer")
        init_text = _truncate(init_node.text() if init_node else "init")
        init_id = f"for_init_{base}"
        b.add_node(init_id, init_text, "rect", _span(node))
        _wire(b, entry_ids, init_id, edge_label)

        cond_node = node.field("condition")
        raw_cond = (cond_node.text() if cond_node else "").strip()
        cond_text = _truncate("for: " + raw_cond) if raw_cond else "(infinite)"
        cond_id = f"for_cond_{base}"
        b.add_node(cond_id, cond_text, "loop_diamond")
        b.add_edge(init_id, cond_id)

        merge_id = f"for_merge_{base}"
        b.add_node(merge_id, "", "junction")
        b.add_edge(cond_id, merge_id)

        ctx.break_stack.append(merge_id)
        ctx.continue_stack.append(cond_id)

        update_node = node.field("update")
        update_text = _truncate(update_node.text() if update_node else "update")
        update_id = f"for_update_{base}"
        b.add_node(update_id, update_text, "rect")

        body = node.field("body")
        body_exits: list[str] = []
        if body:
            body_exits = traverser.traverse_statement(body, ctx, [cond_id], "Yes")
        else:
            body_exits = [cond_id]

        for exit_id in body_exits:
            b.add_edge(exit_id, update_id)
        b.add_edge(update_id, cond_id)

        ctx.break_stack.pop()
        ctx.continue_stack.pop()

        return [merge_id]


class WhileStatementVisitor:
    kind = "while_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        b = ctx.builder
        base = node.range().start.index

        cond_node = node.field("condition")
        cond_text = _truncate("while: " + (cond_node.text() if cond_node else "condition"))
        cond_id = f"while_cond_{base}"
        b.add_node(cond_id, cond_text, "loop_diamond", _span(node))
        _wire(b, entry_ids, cond_id, edge_label)

        merge_id = f"while_merge_{base}"
        b.add_node(merge_id, "", "junction")
        b.add_edge(cond_id, merge_id)

        ctx.break_stack.append(merge_id)
        ctx.continue_stack.append(cond_id)

        body = node.field("body")
        body_exits: list[str] = []
        if body:
            body_exits = traverser.traverse_statement(body, ctx, [cond_id], "Yes")
        else:
            body_exits = [cond_id]

        for exit_id in body_exits:
            b.add_edge(exit_id, cond_id)

        ctx.break_stack.pop()
        ctx.continue_stack.pop()

        return [merge_id]


class DoStatementVisitor:
    kind = "do_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        b = ctx.builder
        base = node.range().start.index

        body_entry_id = f"do_body_{base}"
        b.add_node(body_entry_id, "do", "rect", _span(node))
        _wire(b, entry_ids, body_entry_id, edge_label)

        cond_node = node.field("condition")
        cond_text = _truncate("do-while: " + (cond_node.text() if cond_node else "condition"))
        cond_id = f"do_cond_{base}"
        b.add_node(cond_id, cond_text, "loop_diamond")

        merge_id = f"do_merge_{base}"
        b.add_node(merge_id, "", "junction")
        b.add_edge(cond_id, merge_id)

        ctx.break_stack.append(merge_id)
        ctx.continue_stack.append(cond_id)

        body = node.field("body")
        body_exits: list[str] = []
        if body:
            body_exits = traverser.traverse_statement(body, ctx, [body_entry_id])
        else:
            body_exits = [body_entry_id]

        for exit_id in body_exits:
            b.add_edge(exit_id, cond_id)
        b.add_edge(cond_id, body_entry_id, "Yes")

        ctx.break_stack.pop()
        ctx.continue_stack.pop()

        return [merge_id]


class ReturnStatementVisitor:
    kind = "return_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        ret_id = _node_id(node)
        ctx.builder.add_node(ret_id, _truncate(node.text() or "return"), "rect", _span(node))
        _wire(ctx.builder, entry_ids, ret_id, edge_label)
        return []


class BreakStatementVisitor:
    kind = "break_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        break_id = _node_id(node)
        ctx.builder.add_node(break_id, "break", "rect", _span(node))
        _wire(ctx.builder, entry_ids, break_id, edge_label)
        if ctx.break_stack:
            ctx.builder.add_edge(break_id, ctx.break_stack[-1], "exit loop")
        return []


class ContinueStatementVisitor:
    kind = "continue_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        cont_id = _node_id(node)
        ctx.builder.add_node(cont_id, "continue", "rect", _span(node))
        _wire(ctx.builder, entry_ids, cont_id, edge_label)
        if ctx.continue_stack:
            ctx.builder.add_edge(cont_id, ctx.continue_stack[-1], "continue loop")
        return []


class SwitchStatementVisitor:
    kind = "switch_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        b = ctx.builder
        base = node.range().start.index

        val_node = node.field("value")
        val_text = _truncate(val_node.text() if val_node else "switch")
        switch_id = f"switch_{base}"
        b.add_node(switch_id, f"switch: ({val_text})", "diamond", _span(node))
        _wire(b, entry_ids, switch_id, edge_label)

        merge_id = f"switch_merge_{base}"
        b.add_node(merge_id, "", "junction")

        ctx.break_stack.append(merge_id)

        body = node.field("body")
        all_exits: list[str] = []
        if body:
            cases = [
                c for c in body.children()
                if c.is_named() and c.kind() in ("case_statement", "default_statement")
            ]
            for case in cases:
                case_exits = traverser.traverse_statement(case, ctx, [switch_id])
                all_exits.extend(case_exits)

        ctx.break_stack.pop()

        for exit_id in all_exits:
            b.add_edge(exit_id, merge_id)
        if not all_exits:
            b.add_edge(switch_id, merge_id)

        return [merge_id]


class CaseStatementVisitor:
    kind = "case_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        val_node = node.field("value")
        if val_node is None:
            val_text = "default"
            node_label = "default"
        else:
            val_text = val_node.text()
            node_label = f"case {val_text}"
        case_id = _node_id(node)
        ctx.builder.add_node(case_id, _truncate(node_label), "rect", _span(node))
        _wire(ctx.builder, entry_ids, case_id, val_text)
        stmts = [c for c in node.children() if c.is_named() and c.kind() != "case_statement"]
        current = [case_id]
        for stmt in stmts:
            if not current:
                break
            current = traverser.traverse_statement(stmt, ctx, current)
        return current


class DefaultStatementVisitor:
    kind = "default_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        default_id = _node_id(node)
        ctx.builder.add_node(default_id, "default", "rect", _span(node))
        _wire(ctx.builder, entry_ids, default_id, "default")
        stmts = [c for c in node.children() if c.is_named()]
        current = [default_id]
        for stmt in stmts:
            if not current:
                break
            current = traverser.traverse_statement(stmt, ctx, current)
        return current


class GotoStatementVisitor:
    kind = "goto_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        warn_id = _node_id(node)
        ctx.builder.add_node(warn_id, "goto (unsupported)", "rect", _span(node))
        _wire(ctx.builder, entry_ids, warn_id, edge_label)
        return [warn_id]


class ExpressionStatementVisitor:
    kind = "expression_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        stmt_id = _node_id(node)
        ctx.builder.add_node(stmt_id, _truncate(node.text() or "expr"), "rect", _span(node))
        _wire(ctx.builder, entry_ids, stmt_id, edge_label)
        return [stmt_id]


class DeclarationVisitor:
    kind = "declaration"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        decl_id = _node_id(node)
        ctx.builder.add_node(decl_id, _truncate(node.text() or "decl"), "rect", _span(node))
        _wire(ctx.builder, entry_ids, decl_id, edge_label)
        return [decl_id]


class CommentVisitor:
    kind = "comment"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        return entry_ids


class LabelStatementVisitor:
    kind = "label_statement"

    def visit(self, node: "SgNode", ctx: TraversalContext, entry_ids: list[str], edge_label: str = "") -> list[str]:
        traverser = ctx.traverser
        label_node = node.field("name") or node.child(0)
        label_name = label_node.text() if label_node else node.kind()
        label_id = _node_id(node)
        ctx.builder.add_node(label_id, f"label: {label_name}", "rect", _span(node))
        _wire(ctx.builder, entry_ids, label_id, edge_label)
        stmts = [c for c in node.children() if c.is_named() and c != label_node]
        current: list[str] = [label_id]
        for stmt in stmts:
            if not current:
                break
            current = traverser.traverse_statement(stmt, ctx, current)
        return current


REGISTRY: dict[str, Visitor] = {}

_ALL_VISITORS = [
    FunctionDefinitionVisitor,
    CompoundStatementVisitor,
    IfStatementVisitor,
    ElseClauseVisitor,
    ForStatementVisitor,
    WhileStatementVisitor,
    DoStatementVisitor,
    ReturnStatementVisitor,
    BreakStatementVisitor,
    ContinueStatementVisitor,
    SwitchStatementVisitor,
    CaseStatementVisitor,
    DefaultStatementVisitor,
    GotoStatementVisitor,
    ExpressionStatementVisitor,
    DeclarationVisitor,
    CommentVisitor,
    LabelStatementVisitor,
]

for _v in _ALL_VISITORS:
    REGISTRY[_v.kind] = _v()

