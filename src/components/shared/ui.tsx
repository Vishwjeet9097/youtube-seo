import type { ComponentType, HTMLAttributes, ReactNode, SVGProps } from "react";
import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="min-w-0 max-w-4xl">
        {eyebrow ? (
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-brand animate-pulse" />
            <p className="page-eyebrow">{eyebrow}</p>
          </div>
        ) : null}
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={`panel ${className}`} {...props} />;
}

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "small" | "icon";
}) {
  const variants = {
    primary: "button-primary",
    secondary: "button-secondary",
    ghost: "button-ghost",
    danger: "button-danger",
  };
  const sizes = {
    default: "",
    small: "!h-9 !px-3 !text-xs",
    icon: "!size-10 !px-0",
  };
  return <button className={`${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  className?: string;
  title?: string;
}) {
  const tones = {
    neutral: "border-border-strong/70 bg-surface-muted text-muted",
    brand: "border-brand/35 bg-brand-soft text-brand-strong dark:text-brand",
    success: "border-success/35 bg-success-soft text-success",
    warning: "border-warning/35 bg-warning-soft text-warning",
    danger: "border-danger/35 bg-danger-soft text-danger",
    info: "border-info/35 bg-info-soft text-info",
  };
  return (
    <span className={`badge ${tones[tone]} ${className}`} title={title}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: {
      box: "border-info/30 bg-info-soft/70 dark:bg-info-soft/40",
      icon: "bg-info/15 text-info",
      text: "text-info",
      bar: "bg-info",
      Icon: Info,
    },
    success: {
      box: "border-success/30 bg-success-soft/70 dark:bg-success-soft/40",
      icon: "bg-success/15 text-success",
      text: "text-success",
      bar: "bg-success",
      Icon: CheckCircle2,
    },
    warning: {
      box: "border-warning/30 bg-warning-soft/70 dark:bg-warning-soft/40",
      icon: "bg-warning/15 text-warning",
      text: "text-warning",
      bar: "bg-warning",
      Icon: TriangleAlert,
    },
    danger: {
      box: "border-danger/30 bg-danger-soft/70 dark:bg-danger-soft/40",
      icon: "bg-danger/15 text-danger",
      text: "text-danger",
      bar: "bg-danger",
      Icon: AlertCircle,
    },
  };
  const { box, icon, text, bar, Icon } = styles[tone];
  return (
    <div
      className={`relative overflow-hidden flex gap-3.5 rounded-2xl border p-4 ${box} ${className}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${icon}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`font-mono text-[12px] font-bold uppercase tracking-wider ${text}`}>{title}</p>
        <div className="mt-1 text-xs leading-5 text-muted">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-9" : "py-14 sm:py-16"}`}>
      <div className="relative mb-4 grid size-13 place-items-center rounded-2xl border border-brand/25 bg-brand-soft/70 text-brand-strong dark:text-brand shadow-[var(--shadow-sm)]">
        <span className="absolute -inset-1 rounded-2xl border border-brand/20 opacity-40 animate-pulse" />
        <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs sm:text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading results" }: { label?: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3.5 text-sm text-muted" role="status">
      <div className="relative grid size-11 place-items-center rounded-2xl border border-brand/30 bg-brand-soft text-brand-strong dark:text-brand shadow-[0_0_20px_rgba(6,182,212,0.25)]">
        <span className="absolute -inset-1.5 rounded-2xl border border-brand/20 opacity-60 animate-ping" />
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      </div>
      <span className="font-mono text-xs uppercase tracking-wider">{label}…</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <article className="metric-card group">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-brand/25 bg-brand-soft/70 text-brand-strong dark:text-brand shadow-[0_0_12px_rgba(6,182,212,0.15)] transition group-hover:scale-105">
          <Icon className="size-4" strokeWidth={1.9} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-[1.55] text-muted">{detail}</p>
      <div className="mt-3.5 flex items-center gap-1.5 pt-2 border-t border-border/50">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted border border-border/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-bright transition-all duration-500"
            style={{ width: typeof value === "number" && value > 0 ? `${Math.min(100, Math.max(18, value * 6))}%` : "30%" }}
          />
        </div>
        <span className="font-mono text-[9px] font-bold text-muted/70 tracking-wider">TELEMETRY</span>
      </div>
    </article>
  );
}

export function DividerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-subtle">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
