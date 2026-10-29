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
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
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
    neutral: "border-border-strong bg-surface-muted text-muted",
    brand: "border-brand/20 bg-brand-soft text-brand-strong",
    success: "border-success/20 bg-success-soft text-success",
    warning: "border-warning/20 bg-warning-soft text-warning",
    danger: "border-danger/20 bg-danger-soft text-danger",
    info: "border-info/20 bg-info-soft text-info",
  };
  return <span className={`badge ${tones[tone]} ${className}`} title={title}>{children}</span>;
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
    info: { box: "border-info/20 bg-info-soft/80", icon: "bg-info/10 text-info", text: "text-info", Icon: Info },
    success: { box: "border-success/20 bg-success-soft/80", icon: "bg-success/10 text-success", text: "text-success", Icon: CheckCircle2 },
    warning: { box: "border-warning/20 bg-warning-soft/80", icon: "bg-warning/10 text-warning", text: "text-warning", Icon: TriangleAlert },
    danger: { box: "border-danger/20 bg-danger-soft/80", icon: "bg-danger/10 text-danger", text: "text-danger", Icon: AlertCircle },
  };
  const { box, icon, text, Icon } = styles[tone];
  return (
    <div className={`flex gap-3.5 rounded-2xl border p-4 ${box} ${className}`} role={tone === "danger" ? "alert" : "status"}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${icon}`}><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 pt-0.5">
        <p className={`text-[13px] font-bold ${text}`}>{title}</p>
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
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-10" : "py-14 sm:py-16"}`}>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-brand/15 bg-brand-soft/70 text-brand-strong shadow-[var(--shadow-xs)]">
        <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading results" }: { label?: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3.5 text-sm text-muted" role="status">
      <span className="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand-strong"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /></span>
      <span>{label}…</span>
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
    <article className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-[12px] font-semibold leading-4 text-muted">{label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong"><Icon className="size-4" strokeWidth={1.9} aria-hidden="true" /></span>
      </div>
      <p className="mt-3 text-[28px] font-bold leading-none tracking-[-0.04em] text-foreground tabular-nums">{value}</p>
      <p className="mt-2 text-[11px] leading-[1.55] text-muted">{detail}</p>
    </article>
  );
}

export function DividerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-subtle">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
