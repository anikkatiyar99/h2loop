# Backend

FastAPI service that parses C source code, traverses each function's control flow graph, and streams Mermaid diagrams with source-span mappings over WebSocket.

## Stack

| Package | Purpose |
|---|---|
| FastAPI 0.115 | Async HTTP + WebSocket framework |
| uvicorn 0.34 | ASGI server |
| ast-grep-py 0.42 | Rust-powered C AST parsing |
| libclang 18.1 | Clang bindings for syntax validation |
| pydantic-settings | Config from environment variables |

## Project layout

```
app/
├── main.py                  # FastAPI app factory, logging setup
├── config.py                # Settings (env vars with defaults)
├── schemas.py               # Pydantic models (Job, FunctionResult, WsEvent, …)
├── api/
│   └── routes.py            # HTTP endpoints + WebSocket handler
├── services/
│   ├── job_store.py         # Thread-safe in-memory job store + event bus
│   ├── job_processor.py     # Background task: AST parse → CFG traverse → emit events
│   └── syntax_validation.py # Clang diagnostic wrapper
└── traversal/
    ├── traverser.py         # CTraverser — recursive CFG walker
    ├── visitors.py          # Per-node-kind visitor implementations
    ├── mermaid_builder.py   # Mermaid flowchart text builder
    ├── context.py           # Traversal state (break/continue stacks, builder ref)
    └── __init__.py          # _extract_name helper
tests/
├── test_api.py              # Integration tests (HTTP + WebSocket)
├── test_syntax_validation.py
├── test_concurrency.py      # Thread-safety tests for JobStore
└── traversal/
    └── test_traversal.py    # CFG traversal + diagram generation
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/jobs` | Submit C code for analysis → returns `job_id` immediately (202) |
| `POST` | `/api/validate` | Validate syntax via Clang without creating a job |
| `GET` | `/api/jobs` | List all jobs, newest first |
| `GET` | `/api/jobs/{job_id}` | Full job details with results |
| `GET` | `/api/health` | Health check with job-store capacity |
| `WS` | `/ws/jobs/{job_id}` | Stream analysis events; replays buffered history on connect |

Swagger UI: `http://localhost:8000/docs`

### Request / response shapes

**POST /api/jobs**
```json
// Request
{ "code": "int add(int a, int b) { return a + b; }" }

// Response 202
{ "job_id": "550e8400-...", "status": "queued" }

// Errors
// 422 — empty code, >500 KB, or syntax invalid
// 429 — job store at capacity
```

**POST /api/validate**
```json
// Response 200
{
  "valid": false,
  "errors": [
    { "message": "expected ';'", "line": 3, "column": 12,
      "end_line": 3, "end_column": 13, "source": "clang" }
  ]
}
```

**WS /ws/jobs/{job_id} — event stream**
```json
{ "type": "job_started",   "total_functions": 3 }
{ "type": "function_done", "function_name": "add",
  "mermaid": "flowchart TD\n...",
  "span_map": { "return_statement_45": [1, 1] },
  "too_large": false, "processed": 1, "total": 3 }
{ "type": "job_complete",  "status": "success" }
{ "type": "error",         "message": "..." }
```

Late-joining clients receive all buffered events before live ones.

## Job pipeline

```
POST /api/jobs
  └─ 1. Clang syntax check (run_in_executor)
  └─ 2. store.create(code)  →  Job(status=QUEUED)
  └─ 3. background_tasks.add_task(process_job)   ← returns 202 here

process_job (background thread):
  └─ SgRoot(code, "c") — ast-grep AST
  └─ find_all(kind="function_definition")
  └─ emit "job_started"
  └─ for each function:
       CTraverser.traverse_function(fn_node)
         └─ recursive CFG walk via visitor registry
         └─ returns (mermaid_str, span_map, node_count)
       emit "function_done"
  └─ store.update(status=SUCCESS, results=[…])
  └─ emit "job_complete"
```

## CFG traversal

`CTraverser` walks the AST recursively. Each node kind dispatches to a registered `Visitor`:

| Visitor | Mermaid shape | Notes |
|---|---|---|
| `IfStatementVisitor` | diamond | Yes/No branches, merge junction at end |
| `ForStatementVisitor` | loop_diamond | init → condition → body → update → back |
| `WhileStatementVisitor` | loop_diamond | condition → body → back |
| `DoStatementVisitor` | loop_diamond | body → condition → back |
| `SwitchStatementVisitor` | diamond | case labels as edges |
| `BreakStatementVisitor` | rect | Edge labeled "exit loop" to enclosing merge node |
| `ContinueStatementVisitor` | rect | Edge labeled "continue loop" to enclosing condition |
| `ReturnStatementVisitor` | rect | Terminates the current path |
| `DeclarationVisitor` | rect | Variable declarations |
| `ExpressionStatementVisitor` | rect | Expressions, assignments, calls |
| `CommentVisitor` | — | Passthrough, no node emitted |

Diagrams with more than 100 nodes are skipped (`too_large: true`) to prevent rendering overload.

## Mermaid generation

`MermaidBuilder` accumulates nodes and edges then renders a `flowchart TD` string.

Node shapes map to CSS classes for consistent styling:

| Shape | Used for | Color |
|---|---|---|
| `stadium` | Function entry/exit | Cyan |
| `rect` | Statements | Blue |
| `diamond` | `if` / `switch` | Amber |
| `loop_diamond` | `for` / `while` / `do-while` | Cyan |
| `junction` | Merge points | Slate |

Labels are truncated at 96 characters, wrapped at 32 characters per line (24 for diamonds), and capped at 4 lines. Special characters `"`, `|`, `<`, `>`, `&` are HTML-escaped; `[`, `]`, `{`, `}` are passed through as-is since the Mermaid parser accepts them inside double-quoted labels.

## Configuration

Set via environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `MAX_CODE_BYTES` | `500000` | Maximum accepted source size |
| `MAX_JOBS` | `500` | In-memory job capacity; oldest completed job evicted when full |
| `CORS_ORIGINS` | `["*"]` | Comma-separated allowed origins |

## Running locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Run tests
python3 -m pytest tests -q
```

## Docker

```dockerfile
# Built as part of docker compose — see root docker-compose.yml
docker compose up --build
```

The container exposes port 8000 but is not published directly to the host in the compose stack; nginx proxies `/api/`, `/ws/`, and `/docs` from port 3000.
