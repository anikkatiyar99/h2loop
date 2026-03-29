from __future__ import annotations

from ast_grep_py import SgRoot

from app.traversal import CTraverser, _extract_name


def _run(c_code: str) -> tuple[str, dict, int]:
    root = SgRoot(c_code, "c")
    fn_nodes = root.root().find_all(kind="function_definition")
    assert fn_nodes, f"No functions found in code:\n{c_code}"
    traverser = CTraverser()
    return traverser.traverse_function(fn_nodes[0])


def _run_all(c_code: str) -> list[tuple[str, dict, int]]:
    root = SgRoot(c_code, "c")
    fn_nodes = root.root().find_all(kind="function_definition")
    traverser = CTraverser()
    return [traverser.traverse_function(fn) for fn in fn_nodes]


def _deep_nesting_c(depth: int = 52) -> str:
    body = "return 0;"
    for i in range(depth):
        body = f"if (x > {i}) {{ {body} }}"
    return f"int f(int x) {{ {body} }}"


class TestSimpleReturn:
    def test_contains_start(self) -> None:
        mermaid, _, _ = _run("int foo(void) { return 42; }")
        assert "foo: start" in mermaid

    def test_contains_return(self) -> None:
        mermaid, _, _ = _run("int foo(void) { return 42; }")
        assert "return" in mermaid.lower()

    def test_mermaid_header(self) -> None:
        mermaid, _, _ = _run("int foo(void) { return 42; }")
        assert mermaid.startswith("flowchart TD")


class TestIfNoElse:
    CODE = "int f(int x) { if (x > 0) { return 1; } return 0; }"

    def test_has_yes_edge(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "Yes" in mermaid

    def test_has_no_edge(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "No" in mermaid

    def test_has_condition(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "x > 0" in mermaid or "x&gt;0" in mermaid or "x &gt; 0" in mermaid or "x>" in mermaid


class TestIfElse:
    CODE = "int f(int x) { if (x > 0) { return 1; } else { return -1; } }"

    def test_has_yes_no(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "Yes" in mermaid
        assert "No" in mermaid


class TestForLoop:
    CODE = "void f(void) { for (int i = 0; i < 10; i++) { doWork(); } }"

    def test_has_yes_no(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "Yes" in mermaid  # into the body
        # No label on the exit edge — loop exit flows unconditionally to next statement

    def test_has_condition(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "i < 10" in mermaid or "i&lt;10" in mermaid or "i &lt; 10" in mermaid or "i<10" in mermaid


class TestNestedIf:
    CODE = "int f(int x, int y) { if (x) { if (y) { return 1; } } return 0; }"

    def test_multiple_yes_no(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert mermaid.count("Yes") >= 1
        assert mermaid.count("No") >= 1


class TestBreakInLoop:
    CODE = "void f(void) { for (int i = 0; i < 10; i++) { if (i > 5) break; } }"

    def test_has_break_edge(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "break" in mermaid.lower()


class TestMultiFunction:
    CODE = "int add(int a, int b) { return a + b; } int sub(int a, int b) { return a - b; }"

    def test_both_functions_traversed(self) -> None:
        results = _run_all(self.CODE)
        assert len(results) == 2
        mermaid_combined = results[0][0] + results[1][0]
        assert "add: start" in mermaid_combined
        assert "sub: start" in mermaid_combined


class TestNodeCountGuard:
    def test_too_large_returns_empty(self) -> None:
        code = _deep_nesting_c()
        mermaid, span_map, count = _run(code)
        assert count > 100, f"Expected >100 nodes, got {count}"
        assert mermaid == "", "Expected empty mermaid for too_large"
        assert span_map == {}, "Expected empty span_map for too_large"


class TestSpanMap:
    CODE = "int f(int x) { if (x > 0) { return 1; } return 0; }"

    def test_span_map_has_entries(self) -> None:
        _, span_map, _ = _run(self.CODE)
        assert len(span_map) > 0

    def test_span_values_are_lists_of_ints(self) -> None:
        _, span_map, _ = _run(self.CODE)
        for key, value in span_map.items():
            assert isinstance(value, list)
            assert len(value) == 2
            assert all(isinstance(item, int) for item in value)


class TestExtractName:
    def test_simple_function(self) -> None:
        root = SgRoot("int foo(void) { return 0; }", "c")
        fn_nodes = root.root().find_all(kind="function_definition")
        assert _extract_name(fn_nodes[0]) == "foo"

    def test_pointer_return(self) -> None:
        root = SgRoot("char *get_name(void) { return 0; }", "c")
        fn_nodes = root.root().find_all(kind="function_definition")
        name = _extract_name(fn_nodes[0])
        assert "get_name" in name


class TestWhileLoop:
    CODE = "void f(int x) { while (x > 0) { x--; } }"

    def test_has_yes_no(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "Yes" in mermaid  # into the body
        # No label on the exit edge — loop exit flows unconditionally to next statement


class TestGoto:
    CODE = "void f(void) { goto end; end: return; }"

    def test_goto_warning_present(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "goto" in mermaid.lower()


class TestLabelFormatting:
    CODE = """
    int f(void) {
        printf("this is a very long line that should wrap instead of getting chopped too early by the diagram builder");
        return 0;
    }
    """

    def test_long_labels_use_wrapped_html_breaks(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "<br/>" in mermaid

    def test_long_labels_keep_escaped_quotes(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "&quot;" in mermaid


class TestDoWhileLoop:
    CODE = "void f(int x) { do { x--; } while (x > 0); }"

    def test_has_yes_no(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "Yes" in mermaid  # repeat back into body
        # No label on the exit edge — loop exit flows unconditionally to next statement

    def test_has_condition(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "do-while" in mermaid or "x > 0" in mermaid or "x&gt;0" in mermaid


class TestSwitch:
    CODE = """
    int f(int x) {
        switch (x) {
            case 1: return 1;
            case 2: return 2;
            default: return 0;
        }
    }
    """

    def test_has_switch_diamond(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "switch" in mermaid.lower()

    def test_has_default_case(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "default" in mermaid.lower()


class TestInfiniteForLoop:
    CODE = "void f(void) { for (;;) { return; } }"

    def test_renders_infinite_label(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "infinite" in mermaid.lower() or "for" in mermaid.lower()


class TestBreakInSwitch:
    CODE = """
    void f(int x) {
        switch (x) {
            case 1:
                x = 2;
                break;
            default:
                break;
        }
    }
    """

    def test_renders_without_error(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert mermaid  # should not be empty (not too_large)
        assert "switch" in mermaid.lower()


class TestContinueInLoop:
    CODE = "void f(int x) { while (x > 0) { if (x == 5) continue; x--; } }"

    def test_has_continue(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "continue" in mermaid.lower()


class TestEmptyFunctionBody:
    CODE = "void f(void) { }"

    def test_renders_start_end(self) -> None:
        mermaid, _, _ = _run(self.CODE)
        assert "f: start" in mermaid
        assert "f: end" in mermaid

