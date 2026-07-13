import { CRM_LEAD_SORT_OPTIONS, type CrmLeadSortKey } from "../../../lib/crmLeadSort";

const btnCls =
  "flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[var(--bg)] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition";

type Props = {
  sortKey: CrmLeadSortKey;
  sortAsc: boolean;
  onSortChange: (key: CrmLeadSortKey, asc?: boolean) => void;
};

export function CrmSortControl({ sortKey, sortAsc, onSortChange }: Props) {
  const currentLabel = CRM_LEAD_SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Nome";

  return (
    <div className="flex items-center gap-1">
      <details className="group relative">
        <summary className={`${btnCls} min-w-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-slate-500">
            <path d="M2.75 4.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75ZM3.5 8a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H4.25A.75.75 0 0 1 3.5 8Zm1 2.75a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z" />
          </svg>
          <span className="max-w-[100px] truncate text-slate-200">{currentLabel}</span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-slate-500 group-open:rotate-180 transition">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-lg border border-slate-700 bg-[var(--panel)] p-1 shadow-xl">
          {CRM_LEAD_SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                onSortChange(opt.value);
                (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
              }}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                sortKey === opt.value
                  ? "bg-sky-600/15 text-sky-300"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </details>
      <button
        type="button"
        onClick={() => onSortChange(sortKey, !sortAsc)}
        title={sortAsc ? "Crescente" : "Decrescente"}
        className={`${btnCls} px-2 tabular-nums`}
      >
        {sortAsc ? "↑" : "↓"}
      </button>
    </div>
  );
}
