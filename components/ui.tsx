import type { ButtonHTMLAttributes, ReactNode } from "react";

/* Small, dependency-free primitives. Neutral zinc surface, one semantic colour per meaning. */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const VARIANT: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400",
  secondary: "bg-white text-zinc-900 border border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 disabled:text-zinc-400",
  ghost: "text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:text-red-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm";
  return (
    <button
      className={`pressable inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap disabled:cursor-not-allowed ${sz} ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}

type Tone = "neutral" | "info" | "warn" | "error" | "success" | "accent";
const TONE: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  accent: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "neutral", children, title, mono = false }: { tone?: Tone; children: ReactNode; title?: string; mono?: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset ${TONE[tone]} ${mono ? "font-mono" : ""}`}
    >
      {children}
    </span>
  );
}

export function Tile({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  const ring = tone === "neutral" ? "border-zinc-200" : TONE[tone].split(" ").find((c) => c.startsWith("ring-"))!.replace("ring-", "border-");
  return (
    <div className={`rounded-lg border bg-white px-4 py-3 ${ring}`}>
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-zinc-200 bg-white ${className}`}>{children}</div>;
}
