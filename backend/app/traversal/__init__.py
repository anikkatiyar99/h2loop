from __future__ import annotations

import re

try:
    from ast_grep_py import SgNode
except ImportError:
    SgNode = object  # type: ignore[assignment,misc]

# Matches plain function names like `foo(` or pointer declarators like `(*foo)(`
_NAME_RE = re.compile(r'\(\s*\*\s*(\w+)\s*\)\s*\(|^[\s*]*(\w+)\s*\(')


def _extract_name(fn_node: "SgNode") -> str:
    try:
        declarator = fn_node.field("declarator")
        if declarator is None:
            return "<anonymous>"
        text = (declarator.text() or "").strip()

        # Try the robust regex first (handles pointer declarators and plain names)
        m = _NAME_RE.search(text)
        if m:
            # group(1) matches `(*name)(`, group(2) matches `name(`
            name = m.group(1) or m.group(2)
            if name:
                return name

        # Fall back to the declarator node's own field("declarator") text when
        # the outer declarator wraps a nested one (e.g. function-pointer typedefs)
        try:
            inner = declarator.field("declarator")
            if inner is not None:
                inner_text = (inner.text() or "").strip().lstrip("*").strip()
                if inner_text:
                    return inner_text
        except Exception:
            pass

        return "<anonymous>"
    except Exception:
        return "<anonymous>"


from .traverser import CTraverser  # noqa: E402

__all__ = ["CTraverser", "_extract_name"]

