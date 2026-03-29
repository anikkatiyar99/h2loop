# C-analyser

C source code → control-flow diagrams, streamed to your browser.

## What it does

Paste or upload a `.c` file. The Monaco editor validates against a real Clang parser live (280ms debounce), showing inline errors before you submit anything. Once submitted, the backend locates every `function_definition` in the AST, walks each one's control flow, and streams a Mermaid flowchart over WebSocket — one per function as it completes. The results page updates incrementally; you don't wait for the full job.

Inside the diagram, every node is clickable. Clicking a node looks up its source span in the `span_map` produced by the traversal engine, then highlights the matching lines of C source in a split pane. Branches, loops, and individual statements all trace back to exact line ranges.

## Local development

**Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
python3 -m pytest tests -q
```

Swagger UI: http://localhost:8000/docs — ReDoc: http://localhost:8000/redoc

**Frontend**
```bash
cd frontend
npm install
npm run dev    # Vite dev server at :5173, proxies /api and /ws to :8000
npm run test   # vitest
npm run build  # output: dist/
```

**Full stack**
```bash
cp .env.example .env
docker compose up --build   # → http://localhost:3000
```

The frontend container is nginx serving the Vite build, reverse-proxying `/api` and `/ws` to the `backend` service. The backend is not published on the host directly.

## Architecture

```
Browser (React 19 + Vite + Tailwind CSS 4)
  |-- Monaco editor          live Clang diagnostics, IBM Plex Mono, paste/upload tabs
  |-- MermaidDiagram         mermaid.js ^11, pan/zoom, node click → span_map lookup
  |-- useJobSocket           WebSocket, 1.5s auto-reconnect, full event buffer replay on reconnect
  |-- useSyntaxValidation    280ms debounce, AbortController cancels in-flight requests
  |
  |  POST /api/validate  — live syntax check, no job created
  |  POST /api/jobs      — validate + enqueue, returns job_id immediately
  |  GET  /api/jobs      — list all jobs, newest first
  |  GET  /api/jobs/:id  — full job with all function results
  |  WS   /ws/jobs/:id   — stream function_done events, replays history on connect
  v
FastAPI (Python 3.11, uvicorn)
  |-- job_store.py      In-memory dict protected by threading.Lock
  |                     Each subscriber gets an asyncio.Queue
  |                     emit() appends to event_buffer AND pushes to all live queues
  |                     subscribe() returns (queue, buffered_events) so late joins replay full history
  |-- job_processor.py  Background task; offloads SgRoot parsing + traversal to thread pool executor
  |                     30s asyncio.wait_for timeout per function
  |-- syntax_validation.py  libclang==18.1.1, flags: -x c -std=c11
  v
AST traversal engine
  |-- ast-grep-py==0.42.0   SgRoot(code, "c") → find_all(kind="function_definition")
  |-- CTraverser             traverse_function() builds MermaidBuilder + TraversalContext
  |                          traverse_statement() dispatches via REGISTRY, falls back to _default()
  |-- TraversalContext       func_name, builder, break_stack[], continue_stack[]
  |                          stacks track nearest enclosing loop for break/continue wiring
  |-- MermaidBuilder         add_node(id, label, shape, span?) / add_edge(src, dst, label?)
  |                          render() → Mermaid string with classDefs
  |                          get_span_map() → {node_id: [start_line, end_line]}
  v
Mermaid flowchart TD string + span_map streamed back as function_done WebSocket events
```

## Repository layout

```
backend/
  app/
    main.py                 FastAPI app factory, lifespan (event loop wiring), CORS
    config.py               Settings: max_code_bytes=500_000, max_jobs=500
    schemas.py              Pydantic models: Job, FunctionResult, WsEvent, request/response types
    api/routes.py           All REST endpoints + WebSocket handler
    services/
      job_store.py          Thread-safe store, pub/sub queues, event buffer, job_count()
      job_processor.py      Async background job: discover → traverse → emit per function
      syntax_validation.py  Clang validation wrapper
    traversal/
      traverser.py          CTraverser, MAX_NODES=100 guard, _default() fallback for unknown nodes
      visitors.py           REGISTRY dict + 18 visitor classes, one per AST node kind
      mermaid_builder.py    _shape(), _wrap_label(), classDef strings, span_map accumulation
      context.py            TraversalContext dataclass
      __init__.py           _extract_name() parses declarator → function name, re-exports CTraverser
  tests/
    test_api.py
    test_syntax_validation.py
    traversal/test_traversal.py

frontend/src/
  pages/
    JobCreate.tsx           Editor page: paste/upload tabs, live validation, submit
    JobList.tsx             Job monitor: 4 metric cards + polled jobs table (2s interval)
    JobResults.tsx          Inspector: function rail, diagram pane, source pane, view toggle
  components/
    AppShell.tsx            Sticky nav + page frame
    CodeEditor.tsx          Monaco wrapper: c-analyser-dark theme, inline diagnostics
    MermaidDiagram.tsx      SVG render, pointer-drag pan, Ctrl+scroll zoom, fit-scale, node click
    SourceHighlight.tsx     Read-only Monaco with line-range highlight
    ui.tsx                  Button, Card, Badge, StatusPill, ButtonLink primitives
  hooks/
    useJobSocket.ts         WebSocket lifecycle, reconnect, event dispatch into React state
    useJobList.ts           2s polling for /api/jobs
    useSyntaxValidation.ts  Debounced validation, abort on new input
  api/
    client.ts               fetch wrappers: validateCode, createJob, getJob, listJobs
    contracts.ts            TypeScript interfaces mirroring Pydantic schemas
  lib/
    constants.ts            MAX_CODE_BYTES, JOB_LIST_POLL_INTERVAL_MS
    format.ts               formatBytes, formatSyntaxError
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/validate` | Clang syntax check — returns `{valid, errors[]}` |
| `POST` | `/api/jobs` | Enqueue analysis — `422` on bad/empty code, `429` at capacity |
| `GET` | `/api/jobs` | All jobs, newest first, with snippets and progress |
| `GET` | `/api/jobs/:id` | Full job including `source_code` and all `FunctionResult` objects |
| `WS` | `/ws/jobs/:id` | Event stream — replays full buffer on connect, `4004` if not found |
| `GET` | `/api/health` | `{status, jobs, max_jobs}` |

**WebSocket event protocol** — all events are JSON with a `type` discriminator:

```
job_started    { total_functions }
function_done  { function_name, mermaid, span_map, too_large, processed, total }
job_complete   { status }
error          { message }
```

After `job_complete` or `error`, the server closes the connection. The client does not reconnect.

## AST traversal engine

### Exit IDs contract

Every visitor receives `entry_ids: list[str]` (the upstream node IDs to wire from) and returns `exit_ids: list[str]` (the open exits the next statement should connect from). An empty return (`[]`) means the path terminated — `CompoundStatementVisitor` stops iterating siblings as soon as exits becomes empty, preventing unreachable nodes from being wired.

### Visitor wiring decisions

| Visitor | Wiring |
|---------|--------|
| `IfStatement` | Amber diamond `if: <cond>`. **No else:** synthetic junction node merges Yes-exits + No-edge, returns `[junction]`. **With else:** returns `true_exits + false_exits` — merge happens downstream when the next sibling statement is wired. |
| `ForStatement` | Cyan loop-diamond `for: <cond>` (or `"(infinite)"` when condition is absent). Wires: entry → init → cond → body → update → cond (loop back). Pushes `merge` onto `break_stack`, `cond` onto `continue_stack` before traversing body. |
| `WhileStatement` | Cyan loop-diamond `while: <cond>`. Body exits loop back to condition with a `"repeat"` edge. Same stack push/pop as `for`. |
| `DoStatement` | Body entry node first, then cyan loop-diamond `do-while: <cond>` after body exits. `"Yes / repeat"` edge goes back to body entry; `"No / exit"` goes to merge junction. Body always executes once. |
| `SwitchStatement` | Amber diamond `switch: (val)`. Direct children of the body that are `case_statement` / `default_statement` are each wired from the diamond with the case value as edge label. `break_stack` top is `switch_merge`, so `break` inside any case wires to merge. Cases without `break` fall through — their exits contribute to `all_exits` which also drain into merge. |
| `Break` / `Continue` | Render a rect, wire `"exit loop"` / `"continue loop"` back-edge to top of `break_stack` / `continue_stack`. Return `[]`. |
| `Return` | Renders expression text as a rect. Returns `[]`. |
| `LabelStatement` | Renders `"label: <name>"` rect, continues traversal into labelled body. Incoming `goto` jumps are not resolved. |
| `Goto` | Renders `"goto (unsupported)"` rect. Returns `[node_id]` — diagram stays connected, but jump target is absent. |
| `Comment` | Silent pass-through — returns `entry_ids` unchanged, no node emitted. |

### Node shapes and colors

| Shape | Mermaid syntax | Fill | Stroke | Used for |
|-------|---------------|------|--------|----------|
| `stadium` | `(["label"])` | `#083344` | cyan | Function start / end |
| `rect` | `["label"]` | `#172033` | blue | Statements, declarations, expressions |
| `diamond` | `{"label"}` | `#2b1d0a` | amber `#f59e0b` | `if:`, `switch:` — branching |
| `loop_diamond` | `{"label"}` | `#0a1d2b` | cyan `#06b6d4` | `while:`, `for:`, `do-while:` — looping |
| `junction` | `((""))` | `#1f2937` | slate | Merge points after if-without-else, loop exits |

Labels are HTML-escaped (`&`, `"`, `<`, `>`, `{`, `}`, `[`, `]`), word-wrapped at shape-specific widths (diamonds: 24 chars, rects: 32, stadiums: 28), and hard-truncated at 96 chars with `...`. Multi-line labels use `<br/>`.

### Guards and limits

- **MAX_NODES = 100** — if `builder.node_count() > 100` after traversal, `traverse_function()` returns `("", {}, count)`. `job_processor.py` sets `too_large=True`. Frontend shows "Too complex" instead of a diagram.
- **30s timeout** — `asyncio.wait_for(..., timeout=30.0)` per function. Timeout sets `count=999`, always triggering `too_large`.
- **500 KB** code limit — enforced at both `/api/validate` and `/api/jobs` before any parsing.
- **Job capacity** — `max_jobs=500`; `store.create()` raises `OverflowError` → HTTP 429.

### Source span mapping

Every `add_node()` call accepts an optional `span: tuple[int, int]`. Visitors call `_span(node)` which reads `node.range().start.line` / `node.range().end.line` (0-indexed, from `ast-grep-py`). `MermaidBuilder` accumulates these in `_span_map`. `get_span_map()` is returned alongside the Mermaid string in each `function_done` event. In `JobResults.tsx`, clicking a node calls `handleNodeClick(nodeId)` → `span_map[nodeId]` → `setHighlightedLines([start, end])` → `SourceHighlight` marks those lines.

## Known limitations

- **In-memory only** — all jobs and results are lost on backend restart; no persistence layer
- **C only** — `ast-grep-py` grammar is `"c"` and Clang validation uses `-x c -std=c11`
- **`goto` unsupported** — jump targets are not resolved; the back-edge to the label is absent
- **No auth** — all jobs are visible to any client that can reach the server
