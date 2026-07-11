import type { ReactNode } from "react";
import { Skeleton } from "../ui/Skeleton";

type StudentPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function StudentPageHeader({ eyebrow, title, description, action }: StudentPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">{eyebrow}</p>
        ) : null}
        <h2 className="text-xl font-semibold leading-tight text-slate-100 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type StudentStatusCardProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
};

const STATUS_TONE_CLASS: Record<NonNullable<StudentStatusCardProps["tone"]>, string> = {
  default: "border-slate-700/60 bg-slate-900/45",
  primary: "border-sky-500/30 bg-sky-500/10",
  success: "border-emerald-500/30 bg-emerald-500/10",
  warning: "border-amber-500/35 bg-amber-500/10",
  danger: "border-red-500/35 bg-red-500/10",
};

export function StudentStatusCard({
  eyebrow,
  title,
  description,
  children,
  action,
  tone = "default",
  className = "",
}: StudentStatusCardProps) {
  return (
    <section className={`rounded-xl border p-4 ${STATUS_TONE_CLASS[tone]} ${className}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{eyebrow}</p>
          ) : null}
          <h3 className="break-words text-base font-semibold text-slate-100">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-5 text-slate-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
};

export function MetricCard({ label, value, hint, valueClassName = "text-slate-100" }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClassName}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function StudentPrimaryAction({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function StudentCockpitSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 md:p-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-3 h-7 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

export function StudentTabSkeleton({ kind = "default" }: { kind?: "default" | "home" | "schedule" | "credits" | "journey" }) {
  if (kind === "home") return <StudentCockpitSkeleton />;
  if (kind === "schedule") {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
        </div>
        <Skeleton className="h-[28rem] rounded-xl" />
      </div>
    );
  }
  if (kind === "credits") {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (kind === "journey") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-24 rounded-lg" />
    </div>
  );
}
