import type { ButtonHTMLAttributes, ReactNode } from "react";

/*
 * Primitives for the inject tool. Every colour is a Hallmark token (app/tokens.css);
 * nothing here reaches for a raw palette value.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-paper border border-ink hover:bg-ink-2 hover:border-ink-2",
  secondary: "bg-paper text-ink border border-rule-2 hover:bg-paper-2",
  ghost: "bg-transparent text-muted border border-transparent hover:bg-paper-2 hover:text-ink",
  danger: "bg-paper text-danger border border-rule-2 hover:bg-danger-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }) {
  const sz = size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm";
  return (
    <button
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`press inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-55 ${sz} ${VARIANT[variant]} ${className}`}
      {...props}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent motion-reduce:animate-none"
    />
  );
}

export type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";
const MARK: Record<Tone, string> = {
  neutral: "bg-rule-2",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  accent: "bg-accent",
};
const TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  accent: "text-accent-ink",
};

/** A small square marker + label. Replaces pill badges: the colour is a signal, not a fill. */
export function Mark({ tone = "neutral", children, title, mono = false }: { tone?: Tone; children: ReactNode; title?: string; mono?: boolean }) {
  return (
    <span title={title} className={`inline-flex max-w-full items-start gap-1.5 text-xs leading-4 ${TEXT[tone]} ${mono ? "font-mono" : ""}`}>
      <span aria-hidden className={`mt-[5px] inline-block size-1.5 shrink-0 rounded-[1px] ${MARK[tone]}`} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

/** Inline code / identifier in the mono outlier register. */
export function Code({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.8125em] text-ink-2 ${className}`}>{children}</span>;
}

/** One figure in a stat strip: number in display weight, label under it. Real numbers only. */
export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="min-w-0 py-3 pr-6">
      <dt className="small-caps-label text-muted">{label}</dt>
      <dd className={`tnum mt-0.5 text-[1.75rem] font-semibold leading-none tracking-[-0.02em] ${tone === "neutral" ? "text-ink" : TEXT[tone]}`}>{value}</dd>
      {hint && <dd className="mt-1.5 line-clamp-2 text-xs leading-4 text-neutral">{hint}</dd>}
    </div>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-rule ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-rule bg-paper ${className}`}>{children}</div>;
}

/** Inline status line for action results. Silent on success unless there is something to read. */
export function Notice({ tone, children }: { tone: "ok" | "danger" | "warn"; children: ReactNode }) {
  const border = tone === "ok" ? "border-ok" : tone === "warn" ? "border-warn" : "border-danger";
  return (
    <p role="status" className={`border-l-2 pl-3 text-sm text-ink-2 ${border}`}>
      {children}
    </p>
  );
}
