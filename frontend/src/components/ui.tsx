import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { JobSummary } from "../api/contracts";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

interface ButtonLinkProps {
  children: ReactNode;
  to: string;
  variant?: Variant;
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

interface BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
}

interface StatusPillProps {
  status: JobSummary["status"];
}

const buttonClasses: Record<Variant, string> = {
  primary:
    "border-cyan-400/70 bg-cyan-400 text-slate-950 shadow-[0_0_0_1px_rgba(34,211,238,0.10),0_4px_14px_rgba(34,211,238,0.18)] hover:bg-cyan-300 hover:border-cyan-300/90 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.16),0_6px_20px_rgba(34,211,238,0.22)]",
  secondary:
    "border-slate-700/80 bg-slate-900 text-slate-100 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)] hover:border-slate-600 hover:bg-slate-800",
  ghost:
    "border-transparent bg-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/60 hover:text-slate-200",
};

export function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60",
        buttonClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ children, to, variant = "primary" }: ButtonLinkProps) {
  return (
    <Link
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium no-underline transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
        buttonClasses[variant],
      ].join(" ")}
      to={to}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <section
      className={[
        "rounded-xl border border-slate-800/80 bg-[#0b111b]/92 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.18),0_20px_40px_rgba(2,6,23,0.14)] backdrop-blur-sm md:p-6",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  const toneClass =
    tone === "accent"
      ? "border-cyan-400/30 bg-cyan-400/12 text-cyan-100"
      : tone === "success"
        ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
        : tone === "warning"
          ? "border-amber-400/30 bg-amber-400/12 text-amber-100"
          : "border-slate-700 bg-slate-900/90 text-slate-300";

  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${toneClass}`}>{children}</span>;
}

export function StatusPill({ status }: StatusPillProps) {
  const labelMap: Record<JobSummary["status"], string> = {
    queued: "Queued",
    in_progress: "Running",
    success: "Done",
    failed: "Failed",
  };

  const config: Record<JobSummary["status"], { pill: string; dot: string }> = {
    queued: {
      pill: "border-slate-700/80 bg-slate-900 text-slate-400",
      dot: "bg-slate-500",
    },
    in_progress: {
      pill: "border-amber-400/25 bg-amber-400/8 text-amber-300",
      dot: "bg-amber-400 animate-pulse",
    },
    success: {
      pill: "border-emerald-400/25 bg-emerald-400/8 text-emerald-300",
      dot: "bg-emerald-400",
    },
    failed: {
      pill: "border-rose-400/25 bg-rose-400/8 text-rose-300",
      dot: "bg-rose-400",
    },
  };

  const { pill, dot } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] ${pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {labelMap[status]}
    </span>
  );
}
