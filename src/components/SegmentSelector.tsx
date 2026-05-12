import type { FlightSegment, SegmentType } from "../types/flight";

type Props = {
  segments: FlightSegment[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
};

const TYPE_ICON: Record<SegmentType, string> = {
  takeoff: "↗",
  landing: "↘",
  tgl: "⇅",
};

const TYPE_COLOR: Record<SegmentType, string> = {
  takeoff: "text-sky-400",
  landing: "text-emerald-400",
  tgl: "text-violet-400",
};

export function SegmentSelector({ segments, selectedId, onChange }: Props) {
  if (segments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Pill
        active={selectedId === null}
        onClick={() => onChange(null)}
        icon="⊙"
        label="Voo completo"
        colorClass="text-slate-300"
      />
      {segments.map((seg) => (
        <Pill
          key={seg.id}
          active={selectedId === seg.id}
          onClick={() => onChange(seg.id)}
          icon={TYPE_ICON[seg.type]}
          label={seg.label}
          colorClass={TYPE_COLOR[seg.type]}
        />
      ))}
    </div>
  );
}

function Pill({
  active,
  onClick,
  icon,
  label,
  colorClass,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-sky-600 text-white"
          : "border border-slate-600 bg-slate-800/60 text-slate-300 hover:border-slate-500 hover:bg-slate-700/60",
      ].join(" ")}
    >
      <span className={active ? "text-white" : colorClass}>{icon}</span>
      {label}
    </button>
  );
}
