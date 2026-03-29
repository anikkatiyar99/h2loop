from __future__ import annotations

from app.services.syntax_validation import validate_c_code


def test_accepts_valid_code_with_standard_header() -> None:
    code = """#include <stdio.h>

int main(void) {
  printf("hello\\n");
  return 0;
}
"""

    assert validate_c_code(code) == []


def test_reports_parse_errors() -> None:
    code = """int main(void) {
  printf("hello\\n")
  return 0;
}
"""

    errors = validate_c_code(code)

    assert errors
    assert any(error["message"] == "expected ';' after expression" for error in errors)


def test_reports_semantic_errors() -> None:
    code = """int main(void) {
  foo = 1;
  return 0;
}
"""

    errors = validate_c_code(code)

    assert errors
    assert any("undeclared identifier" in str(error["message"]) for error in errors)


def test_reports_lexical_errors() -> None:
    code = """int main(void) {
  char *value = "unterminated;
  return 0;
}
"""

    errors = validate_c_code(code)

    assert errors
    assert any("terminating" in str(error["message"]) for error in errors)


def test_reports_broken_include_syntax() -> None:
    code = """#include <stdio.h
int main(void) {
  return 0;
}
"""

    errors = validate_c_code(code)

    assert errors
    assert any(error["message"] == "expected '>'" for error in errors)


def test_reports_missing_header_errors() -> None:
    code = """#include "missing.h"
int main(void) {
  return 0;
}
"""

    errors = validate_c_code(code)

    assert errors
    assert any("file not found" in str(error["message"]) for error in errors)
