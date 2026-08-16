import type { ReactNode } from "react";

export const FPL_BLUE = "#1565C0";
export const FPL_BLUE_DARK = "#0D47A1";
export const FPL_GREEN = "#2E7D32";
export const FPL_FAB = "#00C853";
export const FPL_TOGGLE = "#EC407A";
export const FPL_SECTION = "#E3EAF4";
export const FPL_SECTION_TEXT = "#1E4B8E";

export function FplPhone({ children, fill }: { children: ReactNode; fill?: boolean }) {
  if (fill) {
    return <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-white">{children}</div>;
  }
  return (
    <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[28px] border border-slate-700/80 bg-white shadow-[0_20px_60px_rgba(0,0,0,.45)]">
      {children}
    </div>
  );
}

export function FplHeader({
  title,
  onBack,
  onClose,
  right,
  menu,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: ReactNode;
  menu?: boolean;
}) {
  return (
    <div className="flex h-14 items-center gap-2 px-2 text-white" style={{ background: FPL_BLUE }}>
      {onBack ? (
        <button type="button" onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Voltar">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>
      ) : onClose ? (
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Fechar">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      ) : menu ? (
        <span className="grid h-10 w-10 place-items-center">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </svg>
        </span>
      ) : (
        <span className="w-2" />
      )}
      <div className="min-w-0 flex-1 truncate text-[17px] font-medium tracking-wide">{title}</div>
      {right}
    </div>
  );
}

export function FplSection({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-2 text-[13px] font-semibold uppercase tracking-wide" style={{ background: FPL_SECTION, color: FPL_SECTION_TEXT }}>
      {children}
    </div>
  );
}

export function FplRow({
  label,
  required,
  value,
  placeholder,
  chevron,
  onClick,
  children,
}: {
  label: string;
  required?: boolean;
  value?: string;
  placeholder?: string;
  chevron?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const clickable = Boolean(onClick);
  const inner = (
    <div className="flex min-h-[52px] items-center gap-3 border-b border-slate-200 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] text-slate-800">
          {label}
          {required ? <span className="text-red-500">*</span> : null}
        </div>
        {value || placeholder ? (
          <div className={`truncate text-[13px] ${value ? "text-slate-500" : "text-slate-400"}`}>{value || placeholder}</div>
        ) : null}
      </div>
      {children}
      {chevron ? <span className="text-lg text-slate-400">›</span> : null}
    </div>
  );
  if (!clickable) return inner;
  return (
    <button type="button" className="block w-full text-left" onClick={onClick}>
      {inner}
    </button>
  );
}

export function FplInputRow({
  label,
  required,
  value,
  onChange,
  placeholder,
  mono,
  onHelp,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  onHelp?: () => void;
}) {
  return (
    <label className="flex min-h-[52px] items-center gap-3 border-b border-slate-200 px-4 py-1.5">
      <button
        type="button"
        className="min-w-0 flex-1 text-left text-[15px] text-slate-800"
        onClick={onHelp}
      >
        {label}
        {required ? <span className="text-red-500">*</span> : null}
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-[46%] border-0 bg-transparent text-right text-[15px] uppercase text-slate-600 outline-none placeholder:normal-case placeholder:text-slate-300 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

export function FplToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-6 w-11 shrink-0 rounded-full transition"
      style={{ background: on ? FPL_TOGGLE : "#CFD8DC" }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}

export function FplToggleRow({
  code,
  label,
  on,
  onChange,
  zebra,
}: {
  code: string;
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  zebra?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 ${zebra ? "bg-slate-50" : "bg-white"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold text-slate-900">{code}</div>
        <div className="text-[13px] leading-snug text-slate-600">{label}</div>
      </div>
      <FplToggle on={on} onChange={onChange} />
    </div>
  );
}

export function FplSegmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ code: string; label?: string }>;
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {options.map((opt) => {
        const selected = value === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => onChange(opt.code)}
            className="min-w-[34px] rounded px-2 py-1 text-[13px] font-semibold"
            style={
              selected
                ? { background: FPL_BLUE, color: "#fff" }
                : { background: "transparent", color: FPL_BLUE, border: `1px solid ${FPL_BLUE}` }
            }
            title={opt.label}
          >
            {opt.code}
          </button>
        );
      })}
    </div>
  );
}

export function FplFab({
  icon,
  onClick,
  label,
}: {
  icon: "plus" | "check";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute bottom-5 right-4 grid h-14 w-14 place-items-center rounded-full text-white shadow-lg"
      style={{ background: FPL_FAB }}
    >
      {icon === "plus" ? (
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      )}
    </button>
  );
}

export function FplStatusDot({ status }: { status: "draft" | "valid" | "invalid" }) {
  const color = status === "valid" ? "#00C853" : status === "invalid" ? "#E53935" : "#9E9E9E";
  return <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />;
}
