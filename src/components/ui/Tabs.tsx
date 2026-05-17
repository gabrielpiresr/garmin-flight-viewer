import type { ReactNode } from "react";

type TabAccent = "cyan" | "sky" | "violet";

type TabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  accent?: TabAccent;
  className?: string;
};

const ACTIVE_CLASSES: Record<TabAccent, string> = {
  cyan: "border-cyan-400 text-cyan-400",
  sky: "border-sky-400 text-sky-400",
  violet: "border-violet-400 text-violet-400",
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  accent = "violet",
  className = "",
}: TabsProps<T>) {
  return (
    <div className={`overflow-x-auto border-b border-slate-700/70 ${className}`} role="tablist" aria-label={ariaLabel}>
      <div className="flex min-w-max items-end gap-1">
        {items.map((item) => {
          const isActive = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                isActive
                  ? ACTIVE_CLASSES[accent]
                  : "border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
