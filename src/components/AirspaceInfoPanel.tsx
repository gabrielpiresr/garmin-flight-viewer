import { airspaceTypeLabel, type AirspaceInfo } from "../lib/airspaceLayersDb";

/** Painel flutuante com detalhes da área selecionada. */
export function AirspaceInfoPanel({
  info,
  onClose,
  className,
}: {
  info: AirspaceInfo;
  onClose: () => void;
  className?: string;
}) {
  const typeLabel = airspaceTypeLabel(info.type);
  const rows: Array<{ label: string; value: string }> = [
    { label: "Tipo", value: typeLabel },
    { label: "Ident", value: info.ident },
    { label: "Nome", value: info.name },
    ...(info.frequency ? [{ label: "Frequência FCA", value: info.frequency }] : []),
    ...(info.fir ? [{ label: "FIR", value: info.fir }] : []),
    ...(info.upper ? [{ label: "Limite superior", value: info.upper }] : []),
    ...(info.lower ? [{ label: "Limite inferior", value: info.lower }] : []),
    ...(info.workHours ? [{ label: "Horário de operação", value: info.workHours }] : []),
    ...(info.airspaceClass ? [{ label: "Classe", value: info.airspaceClass }] : []),
    ...(info.locality ? [{ label: "Localidade", value: info.locality }] : []),
    ...(info.remarks ? [{ label: "Observações", value: info.remarks }] : []),
  ];

  return (
    <aside
      className={`pointer-events-auto flex max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950 shadow-2xl shadow-black/50 ${
        className ?? "w-full"
      }`}
      style={{ borderTopColor: info.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: info.color }}>
            {typeLabel}
          </p>
          <p className="truncate font-mono text-sm font-bold tracking-wide text-slate-100">
            {info.ident}
          </p>
          <p className="truncate text-[11px] text-slate-400">{info.name}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={onClose}
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto px-3 py-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{row.label}</p>
            <p className="whitespace-pre-wrap break-words text-[12px] leading-snug text-slate-200">
              {row.value}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
