import { useMemo, useState } from "react";
import { renderRichContent } from "../../lib/maneuverContent";
import type { ScheduleFaqItem } from "../../types/scheduleStudentHelp";

type ScheduleFaqAccordionProps = {
  items: ScheduleFaqItem[];
  query?: string;
  emptyMessage?: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ScheduleFaqAccordion({ items, query = "", emptyMessage }: ScheduleFaqAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return items;
    return items.filter((item) => normalize(`${item.title} ${item.plainText}`).includes(term));
  }, [items, query]);

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        {emptyMessage ?? (query.trim() ? "Nenhuma pergunta encontrada." : "Nenhuma pergunta disponível.")}
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-800/80">
      {filtered.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
              className="flex w-full items-center gap-3 px-1 py-3.5 text-left transition hover:bg-slate-800/30 sm:px-2"
            >
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-200">{item.title}</span>
              {item.source === "custom" ? (
                <span className="shrink-0 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-400">Escola</span>
              ) : null}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {isOpen ? (
              <div className="maneuver-article-content px-1 pb-4 text-sm leading-relaxed text-slate-400 sm:px-2">
                {renderRichContent(item.answerJson)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
