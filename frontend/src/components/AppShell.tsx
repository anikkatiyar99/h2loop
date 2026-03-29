import { NavLink, Outlet, useMatch } from "react-router-dom";
import type { ReactNode } from "react";

export function AppShell() {
  return (
    <div className="min-h-screen bg-[#05070b] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.7),transparent_40%)]" />

      <header className="sticky top-0 z-30 border-b border-slate-800/60 bg-[#05070b]/96 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[60px] w-full max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <NavLink to="/" className="inline-flex items-center gap-3 no-underline group">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/8 font-mono text-[11px] font-bold tracking-widest text-cyan-300 transition-colors group-hover:border-cyan-400/40 group-hover:bg-cyan-400/12">
                h2
              </span>
              <span className="font-mono text-sm font-semibold tracking-tight text-slate-100">
                c-analyser
              </span>
            </NavLink>

            <div className="hidden h-5 w-px bg-slate-800 lg:block" />
            <div className="hidden lg:flex lg:items-center lg:gap-1.5">
              <span className="rounded border border-slate-800/80 bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] text-slate-500">
                AST
              </span>
              <span className="rounded border border-slate-800/80 bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] text-slate-500">
                Mermaid
              </span>
              <span className="rounded border border-slate-800/80 bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] text-slate-500">
                Clang
              </span>
            </div>
          </div>

          <nav aria-label="Primary" className="flex items-center gap-1 rounded-lg border border-slate-800/70 bg-slate-950/60 p-0.5">
            <NavItem to="/">New Analysis</NavItem>
            <NavItem to="/jobs">Jobs</NavItem>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  const match = useMatch(to === "/" ? "/" : `${to}/*`);
  const isActive = Boolean(match);
  return (
    <NavLink
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={[
        "rounded-md px-3.5 py-1.5 text-sm font-medium transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
        isActive
          ? "bg-slate-800/90 text-slate-100 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
          : "bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
      ].join(" ")}
    >
      {children}
    </NavLink>
  );
}
