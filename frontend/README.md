# Frontend

The frontend is a React + Vite application for creating analysis jobs, monitoring progress, and inspecting Mermaid diagrams alongside source code.

## Structure

```text
src/
  app/         App bootstrap and route registration
  api/         Fetch helpers and shared request/response contracts
  components/  Layout, editor, Mermaid, and UI primitives
  hooks/       Polling, sockets, and syntax-validation hooks
  lib/         Constants and formatting helpers
  pages/       Route-level screens
```

## Scripts

```bash
npm install
npm run lint
npm run test
npm run build
```

See the root [README](/Users/anik/Desktop/c-analyser/README.md) for full-stack setup and architecture details.
