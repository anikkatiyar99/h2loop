import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <section className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/60 px-0 pb-5 pt-1">
      <div className="max-w-4xl">
        {eyebrow ? (
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/70">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em] text-slate-50 md:text-[1.75rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}
