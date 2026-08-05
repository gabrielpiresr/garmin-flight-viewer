import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
  Fragment,
} from "react";
import { createPortal } from "react-dom";
import type { DayWeatherSummary, HourWeatherSlot } from "../types/meteoblue";
import {
  formatPrecipMm,
  formatTemp,
  formatWindCompact,
  formatWindKt,
  pictocodeKind,
  type WeatherIconKind,
} from "../lib/meteoblueWeather";

export const WEATHER_COLUMN_KEY = "__weather";
export const WEATHER_COLUMN_WIDTH_PX = 57;

export const weatherColumnStyle: CSSProperties = {
  width: WEATHER_COLUMN_WIDTH_PX,
  minWidth: WEATHER_COLUMN_WIDTH_PX,
  maxWidth: WEATHER_COLUMN_WIDTH_PX,
};

function SunGlyph({ size }: { size: number }) {
  return <circle cx={size / 2} cy={size / 2} r={size * 0.22} fill="#FBBF24" />;
}

function CloudGlyph({ size, gray = false }: { size: number; gray?: boolean }) {
  const fill = gray ? "#94A3B8" : "#E2E8F0";
  const cx = size * 0.52;
  const cy = size * 0.58;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={size * 0.28} ry={size * 0.16} fill={fill} />
      <circle cx={cx - size * 0.14} cy={cy - size * 0.04} r={size * 0.14} fill={fill} />
      <circle cx={cx + size * 0.1} cy={cy - size * 0.08} r={size * 0.16} fill={fill} />
    </g>
  );
}

function RainDrops({ size, count = 2 }: { size: number; count?: number }) {
  const drops = Array.from({ length: count }, (_, i) => i);
  return (
    <g>
      {drops.map((i) => (
        <path
          key={i}
          d={`M${size * (0.38 + i * 0.16)} ${size * 0.72} q${size * 0.03} ${size * 0.08} 0 ${size * 0.12}`}
          stroke="#38BDF8"
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function Bolt({ size }: { size: number }) {
  return (
    <path
      d={`M${size * 0.52} ${size * 0.55} L${size * 0.4} ${size * 0.75} L${size * 0.5} ${size * 0.75} L${size * 0.44} ${size * 0.92} L${size * 0.66} ${size * 0.68} L${size * 0.54} ${size * 0.68} Z`}
      fill="#FBBF24"
    />
  );
}

function SnowFlakes({ size }: { size: number }) {
  return (
    <g stroke="#BAE6FD" strokeWidth={1.2} strokeLinecap="round">
      <line x1={size * 0.4} y1={size * 0.72} x2={size * 0.4} y2={size * 0.86} />
      <line x1={size * 0.34} y1={size * 0.76} x2={size * 0.46} y2={size * 0.82} />
      <line x1={size * 0.34} y1={size * 0.82} x2={size * 0.46} y2={size * 0.76} />
      <line x1={size * 0.58} y1={size * 0.74} x2={size * 0.58} y2={size * 0.88} />
      <line x1={size * 0.52} y1={size * 0.78} x2={size * 0.64} y2={size * 0.84} />
      <line x1={size * 0.52} y1={size * 0.84} x2={size * 0.64} y2={size * 0.78} />
    </g>
  );
}

export function WeatherPictogram({
  pictocode,
  size = 18,
  className = "",
}: {
  pictocode: number;
  size?: number;
  className?: string;
}) {
  const kind: WeatherIconKind = pictocodeKind(pictocode);
  let body: ReactNode = null;
  switch (kind) {
    case "clear":
      body = <SunGlyph size={size} />;
      break;
    case "mostlyClear":
      body = (
        <>
          <SunGlyph size={size} />
          <g transform={`translate(${size * 0.18}, ${size * 0.18}) scale(0.72)`}>
            <CloudGlyph size={size} />
          </g>
        </>
      );
      break;
    case "partlyCloudy":
      body = (
        <>
          <g transform={`translate(${-size * 0.08}, ${-size * 0.12})`}>
            <SunGlyph size={size} />
          </g>
          <CloudGlyph size={size} />
        </>
      );
      break;
    case "cloudy":
      body = <CloudGlyph size={size} gray />;
      break;
    case "fog":
      body = (
        <g stroke="#94A3B8" strokeWidth={1.5} strokeLinecap="round">
          <line x1={size * 0.2} y1={size * 0.4} x2={size * 0.8} y2={size * 0.4} />
          <line x1={size * 0.25} y1={size * 0.55} x2={size * 0.75} y2={size * 0.55} />
          <line x1={size * 0.22} y1={size * 0.7} x2={size * 0.78} y2={size * 0.7} />
        </g>
      );
      break;
    case "drizzle":
      body = (
        <>
          <CloudGlyph size={size} gray />
          <RainDrops size={size} count={1} />
        </>
      );
      break;
    case "rain":
      body = (
        <>
          <CloudGlyph size={size} gray />
          <RainDrops size={size} count={2} />
        </>
      );
      break;
    case "heavyRain":
      body = (
        <>
          <CloudGlyph size={size} gray />
          <RainDrops size={size} count={3} />
        </>
      );
      break;
    case "thunder":
      body = (
        <>
          <CloudGlyph size={size} gray />
          <Bolt size={size} />
        </>
      );
      break;
    case "snow":
    case "sleet":
      body = (
        <>
          <CloudGlyph size={size} gray />
          <SnowFlakes size={size} />
        </>
      );
      break;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    >
      {body}
    </svg>
  );
}

function MiniSeriesChart({
  label,
  values,
  color,
  unit,
  highlightIndex,
}: {
  label: string;
  values: Array<{ hour: number; value: number | null }>;
  color: string;
  unit: string;
  highlightIndex?: number;
}) {
  const width = 220;
  const height = 56;
  const padX = 4;
  const padY = 6;
  const nums = values.map((v) => v.value).filter((v): v is number => v != null && Number.isFinite(v));
  const max = Math.max(1, ...(nums.length ? nums : [1]));
  const barW = values.length > 0 ? (width - padX * 2) / values.length : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500">{unit}</span>
      </div>
      <svg width={width} height={height} className="block w-full max-w-full" viewBox={`0 0 ${width} ${height}`}>
        {values.map((point, i) => {
          const v = point.value ?? 0;
          const h = Math.max(2, ((v || 0) / max) * (height - padY * 2));
          const x = padX + i * barW + 1;
          const y = height - padY - h;
          const active = highlightIndex === i;
          return (
            <g key={`${point.hour}-${i}`}>
              <rect
                x={x}
                y={y}
                width={Math.max(2, barW - 2)}
                height={h}
                rx={1.5}
                fill={color}
                opacity={active ? 1 : point.value == null ? 0.15 : 0.55}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] tabular-nums text-slate-600">
        <span>{values[0] ? `${String(values[0].hour).padStart(2, "0")}h` : ""}</span>
        <span>{values[values.length - 1] ? `${String(values[values.length - 1]!.hour).padStart(2, "0")}h` : ""}</span>
      </div>
    </div>
  );
}

function WeatherDetailCard({
  title,
  subtitle,
  rows,
  series,
  highlightHour,
}: {
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string }>;
  series: HourWeatherSlot[];
  highlightHour?: number;
}) {
  const windValues = series.map((s) => ({ hour: s.hour, value: s.windKt }));
  const precipValues = series.map((s) => ({ hour: s.hour, value: s.precipMm }));
  const highlightIndex = highlightHour != null ? series.findIndex((s) => s.hour === highlightHour) : undefined;

  return (
    <>
      <div className="mb-2 min-w-0">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        {subtitle ? <p className="mt-0.5 text-[11px] text-sky-300">{subtitle}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <span className="text-slate-500">{row.label}</span>
            <span className="truncate text-right font-medium tabular-nums text-slate-200">{row.value}</span>
          </Fragment>
        ))}
      </div>
      {series.length > 0 ? (
        <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
          <MiniSeriesChart
            label="Vento"
            values={windValues}
            color="#38BDF8"
            unit="kt"
            highlightIndex={highlightIndex}
          />
          <MiniSeriesChart
            label="Precipitação"
            values={precipValues}
            color="#60A5FA"
            unit="mm"
            highlightIndex={highlightIndex}
          />
        </div>
      ) : null}
    </>
  );
}

function WeatherHoverShell({
  children,
  panel,
  className = "",
}: {
  children: ReactNode;
  panel: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  const follow = useCallback((event: { clientX: number; clientY: number }) => {
    setCoords({ x: event.clientX, y: event.clientY });
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  const left =
    typeof window === "undefined" ? coords.x + 14 : Math.min(coords.x + 14, window.innerWidth - 292);
  const top =
    typeof window === "undefined" ? coords.y + 14 : Math.min(coords.y + 14, window.innerHeight - 320);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={(event) => follow(event)}
      onMouseMove={(event) => follow(event)}
      onMouseLeave={hide}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-40 w-72 rounded-lg border border-slate-500/55 bg-slate-950/70 p-3 text-left text-xs text-slate-200 shadow-2xl shadow-slate-950/70 ring-1 ring-white/10 backdrop-blur-xl"
              style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }}
            >
              {panel}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Ícone maior para ficar ao lado do número do dia. */
export function ScheduleDayWeatherIcon({ day, size = 28 }: { day: DayWeatherSummary; size?: number }) {
  return <WeatherPictogram pictocode={day.pictocode} size={size} />;
}

/** Stats sob o dia (temp + vento/chuva na mesma linha). */
export function ScheduleDayWeather({
  day,
  daySlots = [],
  compact = false,
  locationLabel,
}: {
  day: DayWeatherSummary;
  daySlots?: HourWeatherSlot[];
  compact?: boolean;
  locationLabel?: string | null;
}) {
  const panel = (
    <WeatherDetailCard
      title={day.label}
      subtitle={[day.dateIso, locationLabel].filter(Boolean).join(" · ")}
      series={daySlots}
      rows={[
        { label: "Máx / Mín", value: `${formatTemp(day.tempMaxC)} / ${formatTemp(day.tempMinC)}` },
        {
          label: "Vento máx",
          value: formatWindCompact(day.windMaxKt, day.windDirDeg),
        },
        {
          label: "Chuva (24h)",
          value: `${formatPrecipMm(day.precipMm)}${day.precipProbPct != null ? ` (${Math.round(day.precipProbPct)}%)` : ""}`,
        },
        ...(day.humidityPct != null ? [{ label: "Umidade", value: `${Math.round(day.humidityPct)}%` }] : []),
        ...(day.feltMaxC != null || day.feltMinC != null
          ? [{ label: "Sensação", value: `${formatTemp(day.feltMaxC)} / ${formatTemp(day.feltMinC)}` }]
          : []),
        ...(day.uvIndex != null ? [{ label: "UV", value: String(Math.round(day.uvIndex)) }] : []),
      ]}
    />
  );

  return (
    <WeatherHoverShell panel={panel}>
      <div className={`flex flex-col items-center leading-tight text-slate-400 ${compact ? "gap-0.5" : "gap-1"}`}>
        <span className={`tabular-nums ${compact ? "text-[11px]" : "text-xs"}`}>
          <span className="font-semibold text-slate-100">{formatTemp(day.tempMaxC)}</span>
          <span className="ml-1 text-slate-500">{formatTemp(day.tempMinC)}</span>
        </span>
        <span className={`flex flex-wrap items-center justify-center gap-x-1 tabular-nums ${compact ? "text-[10px]" : "text-[11px]"}`}>
          <span className="text-slate-300">{formatWindKt(day.windMaxKt)}</span>
          <span className="text-slate-600">·</span>
          <span className="text-sky-400/90">{formatPrecipMm(day.precipMm, true)}</span>
        </span>
      </div>
    </WeatherHoverShell>
  );
}

/** Coluna estreita com resumo a cada 3h. */
export function ScheduleHourlyWeatherColumn({
  slots,
  calendarStartHour,
  calendarEndHour,
  rowHeight,
  boardHeight,
  daySlots,
  locationLabel,
}: {
  slots: HourWeatherSlot[];
  calendarStartHour: number;
  calendarEndHour: number;
  rowHeight: number;
  boardHeight: number;
  /** Série do dia para gráficos na tooltip (todos os slots 3h). */
  daySlots?: HourWeatherSlot[];
  locationLabel?: string | null;
}) {
  const visible = slots.filter((s) => s.hour >= calendarStartHour && s.hour < calendarEndHour);
  const series = daySlots ?? slots;

  return (
    <div
      className="relative overflow-hidden rounded border border-slate-700/50 bg-slate-950/50 sm:rounded-md"
      style={{ height: `${boardHeight}px`, width: "100%" }}
    >
      {visible.map((slot) => {
        const top = (slot.hour - calendarStartHour) * rowHeight;
        const height = Math.min(3 * rowHeight, boardHeight - top);
        const style: CSSProperties = {
          top: `${top}px`,
          height: `${Math.max(rowHeight, height)}px`,
        };
        const panel = (
          <WeatherDetailCard
            title={`${slot.timeLabel} · ${slot.label}`}
            subtitle={[slot.dateIso, locationLabel].filter(Boolean).join(" · ")}
            series={series}
            highlightHour={slot.hour}
            rows={[
              { label: "Temp", value: formatTemp(slot.tempC) },
              { label: "Vento", value: formatWindCompact(slot.windKt, slot.windDirDeg) },
              {
                label: "Chuva (3h)",
                value: `${formatPrecipMm(slot.precipMm)}${slot.precipProbPct != null ? ` (${Math.round(slot.precipProbPct)}%)` : ""}`,
              },
              ...(slot.humidityPct != null ? [{ label: "Umidade", value: `${Math.round(slot.humidityPct)}%` }] : []),
              ...(slot.feltC != null ? [{ label: "Sensação", value: formatTemp(slot.feltC) }] : []),
            ]}
          />
        );
        return (
          <div key={`${slot.dateIso}-${slot.hour}`} className="absolute inset-x-0" style={style}>
            <WeatherHoverShell panel={panel} className="flex h-full w-full">
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 border-b border-slate-800/60 px-0.5 text-center">
                <WeatherPictogram pictocode={slot.pictocode} size={22} />
                <span className="text-[11px] font-semibold tabular-nums leading-none text-slate-100">
                  {formatTemp(slot.tempC)}
                </span>
                <span className="max-w-full truncate text-[9px] tabular-nums leading-tight text-slate-300">
                  {formatWindCompact(slot.windKt, slot.windDirDeg)}
                </span>
                <span className="text-[9px] tabular-nums leading-tight text-sky-400/90">
                  {formatPrecipMm(slot.precipMm, true)}
                </span>
              </div>
            </WeatherHoverShell>
          </div>
        );
      })}
    </div>
  );
}

export function ScheduleWeatherColumnHeader() {
  return (
    <div className="flex h-[18px] items-center justify-center">
      <WeatherPictogram pictocode={3} size={18} />
    </div>
  );
}
