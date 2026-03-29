from __future__ import annotations

import subprocess
from functools import lru_cache
from pathlib import Path

from clang import cindex

SyntaxErrorEntry = dict[str, int | str]

_INPUT_NAME = "input.c"
_PARSE_OPTIONS = cindex.TranslationUnit.PARSE_DETAILED_PROCESSING_RECORD
_BLOCKING_CATEGORIES = {
    "Lexical or Preprocessor Issue",
    "Parse Issue",
    "Semantic Issue",
}


def validate_c_code(code: str) -> list[SyntaxErrorEntry]:
    if not code.strip():
        return []

    translation_unit = _parse_translation_unit(code)
    errors = [
        _diagnostic_to_error(diagnostic)
        for diagnostic in translation_unit.diagnostics
        if _is_syntax_diagnostic(diagnostic)
    ]
    return _dedupe(errors)


def format_syntax_error(error: SyntaxErrorEntry) -> str:
    line = int(error["line"])
    column = int(error["column"])
    message = str(error["message"])
    return f"Code error at line {line}, column {column}: {message}"


def _parse_translation_unit(code: str) -> cindex.TranslationUnit:
    _configure_libclang()
    _get_index()
    return cindex.TranslationUnit.from_source(
        _INPUT_NAME,
        args=_clang_args(),
        unsaved_files=[(_INPUT_NAME, code)],
        options=_PARSE_OPTIONS,
    )


def _is_syntax_diagnostic(diagnostic: cindex.Diagnostic) -> bool:
    category = (diagnostic.category_name or "").strip()
    if category not in _BLOCKING_CATEGORIES:
        return False

    if category == "Semantic Issue":
        return diagnostic.severity >= cindex.Diagnostic.Error

    return True


def _diagnostic_to_error(diagnostic: cindex.Diagnostic) -> SyntaxErrorEntry:
    location = diagnostic.location
    line = max(location.line, 1)
    column = max(location.column, 1)
    end_line = line
    end_column = column + 1

    ranges = list(diagnostic.ranges)
    if ranges:
        end_line = max(ranges[0].end.line, end_line)
        end_column = max(ranges[0].end.column, end_column)

    return {
        "message": diagnostic.spelling.rstrip("."),
        "line": line,
        "column": column,
        "end_line": end_line,
        "end_column": end_column,
        "source": "clang",
    }


def _dedupe(errors: list[SyntaxErrorEntry]) -> list[SyntaxErrorEntry]:
    unique: list[SyntaxErrorEntry] = []
    seen: set[tuple[int, int, str]] = set()

    for error in sorted(
        errors,
        key=lambda entry: (int(entry["line"]), int(entry["column"]), str(entry["message"])),
    ):
        key = (int(error["line"]), int(error["column"]), str(error["message"]))
        if key in seen:
            continue
        seen.add(key)
        unique.append(error)

    return unique


@lru_cache(maxsize=1)
def _get_index() -> cindex.Index:
    _configure_libclang()
    return cindex.Index.create()


def _configure_libclang() -> None:
    if getattr(cindex.Config, "loaded", False):
        return
    if cindex.Config.library_file or cindex.Config.library_path:
        return

    native_dir = Path(cindex.__file__).resolve().parent / "native"
    for library_name in ("libclang.dylib", "libclang.so", "libclang.dll", "clang.dll"):
        candidate = native_dir / library_name
        if candidate.exists():
            cindex.Config.set_library_file(str(candidate))
            return


@lru_cache(maxsize=1)
def _clang_args() -> list[str]:
    args = ["-x", "c", "-std=c11"]
    resource_dir = _clang_resource_dir()
    if resource_dir:
        args.extend(["-resource-dir", resource_dir])
    sdk_path = _macos_sdk_path()
    if sdk_path:
        args.extend(["-isysroot", sdk_path])
    return args


@lru_cache(maxsize=1)
def _macos_sdk_path() -> str | None:
    try:
        sdk_path = subprocess.check_output(
            ["xcrun", "--show-sdk-path"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).strip()
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None

    return sdk_path or None


@lru_cache(maxsize=1)
def _clang_resource_dir() -> str | None:
    try:
        resource_dir = subprocess.check_output(
            ["clang", "-print-resource-dir"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).strip()
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None

    return resource_dir or None
