import { useMemo, useState } from "react";
import {
  decodeMetar,
  mergeParsedForVisual,
  parseMetar,
  splitTafSegments,
  type AiswebTafSegment,
} from "../lib/aiswebMetar";
import type { AiswebAdWarning, AiswebAirportBundle, AiswebParsedMetar } from "../types/aisweb";
import { AiswebConditionVisuals } from "./AiswebMetVisuals";

function resolvedParsed(airport: AiswebAirportBundle | null | undefined): AiswebParsedMetar | null {
  if (!airport) return null;
  if (!airport.met?.metar && !airport.met?.parsed) return null;
  return parseMetar(airport.met.metar) || airport.met.parsed;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RawMessage({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {value ? (
        <div className="overflow-x-auto rounded-md bg-slate-950/70 px-3 py-2.5 font-mono text-[13px] leading-relaxed break-words text-slate-200">
          {value}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function DecodedMetar({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => decodeMetar(value), [value]);
  if (!value || !lines.length) return null;

  return (
    <div className="mt-2 rounded-md border border-slate-800/80 bg-slate-950/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Decodificar
        </span>
        <span className="text-[10px] text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-slate-800 px-2.5 py-2">
          {lines.map((line, index) => (
            <li key={`${line.code}-${index}`} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 ring-1 ring-slate-700/80">
                {line.code}
              </span>
              <span className="min-w-0 pt-0.5 text-slate-200">{line.meaning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TafMessage({
  value,
  empty,
  onPreview,
  activeSegmentId,
  onClearPreview,
}: {
  value: string;
  empty: string;
  onPreview: (segment: AiswebTafSegment) => void;
  activeSegmentId: string | null;
  onClearPreview: () => void;
}) {
  const segments = useMemo(() => splitTafSegments(value), [value]);
  if (!value) return <RawMessage label="TAF" value="" empty={empty} />;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">TAF</p>
        {activeSegmentId ? (
          <button
            type="button"
            className="text-[10px] font-semibold text-amber-300 underline-offset-2 hover:underline"
            onClick={onClearPreview}
          >
            Voltar ao METAR
          </button>
        ) : null}
      </div>
      <div className="space-y-0.5 rounded-md bg-slate-950/70 px-2 py-1.5">
        {segments.map((seg) => {
          const isActive = activeSegmentId === seg.id;
          const canPreview = seg.kind !== "base";
          const tagClass =
            seg.kind === "base"
              ? "bg-slate-800 text-slate-400"
              : seg.kind === "becmg"
                ? "bg-cyan-500/15 text-cyan-300"
                : seg.kind === "tempo"
                  ? "bg-violet-500/15 text-violet-300"
                  : seg.kind === "fm"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-violet-500/15 text-violet-300";
          return (
            <div
              key={seg.id}
              role={canPreview ? "button" : undefined}
              tabIndex={canPreview ? 0 : undefined}
              title={canPreview ? (isActive ? "Voltar ao METAR" : "Ver nas imagens") : undefined}
              aria-pressed={canPreview ? isActive : undefined}
              onClick={canPreview ? () => onPreview(seg) : undefined}
              onKeyDown={
                canPreview
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPreview(seg);
                      }
                    }
                  : undefined
              }
              className={`flex items-start gap-1.5 rounded px-1.5 py-1 transition ${
                canPreview
                  ? "cursor-pointer hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/50"
                  : ""
              } ${isActive ? "bg-amber-500/10 ring-1 ring-amber-500/35" : ""}`}
            >
              <span
                className={`mt-0.5 shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ${tagClass}`}
              >
                {seg.label}
              </span>
              <p className="min-w-0 flex-1 font-mono text-[12px] leading-snug text-slate-200">{seg.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdWarningsPanel({ warnings }: { warnings: AiswebAdWarning[] }) {
  const active = warnings.filter((item) => item.status === "ACTIVE" || item.status === "SCHEDULED");
  const list = active.length ? active : warnings;
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-200">
          Avisos de aeródromo (REDEMET)
        </h4>
        <span className="text-[10px] text-amber-200/70">
          {list.length} mensagem{list.length === 1 ? "" : "ns"}
        </span>
      </div>
      <div className="space-y-2">
        {list.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-amber-500/20 bg-slate-950/50 px-3 py-2.5"
          >
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-bold tracking-wide text-amber-100">
                {item.number ? `AD WRNG ${item.number}` : "AD WRNG"}
                {item.fir ? ` · FIR ${item.fir}` : ""}
              </p>
              {item.status ? (
                <p className="text-[10px] uppercase text-amber-200/70">{item.status}</p>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-slate-200">
              {item.text || "Sem texto."}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
              <span>
                Válido: {formatDateTime(item.validFrom)} → {formatDateTime(item.validTo)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Painel de meteorologia idêntico ao da aba AISWEB (METAR/TAF + visuais). */
export function AiswebMeteorologyPanel({ airport }: { airport: AiswebAirportBundle }) {
  const selectedParsed = resolvedParsed(airport);
  const [tafPreview, setTafPreview] = useState<{
    segmentId: string;
    label: string;
    parsed: AiswebParsedMetar;
  } | null>(null);
  const visualParsed = tafPreview?.parsed ?? selectedParsed;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 @2xl:grid-cols-2">
        <div className="min-w-0">
          <RawMessage label="METAR" value={airport.met?.metar || ""} empty="METAR indisponível." />
          <DecodedMetar value={airport.met?.metar || ""} />
        </div>
        <div className="min-w-0">
          <TafMessage
            value={airport.met?.taf || ""}
            empty="TAF indisponível."
            activeSegmentId={tafPreview?.segmentId ?? null}
            onClearPreview={() => setTafPreview(null)}
            onPreview={(segment) => {
              if (tafPreview?.segmentId === segment.id) {
                setTafPreview(null);
                return;
              }
              const merged = mergeParsedForVisual(selectedParsed, segment.text);
              if (!merged) return;
              setTafPreview({ segmentId: segment.id, label: segment.label, parsed: merged });
            }}
          />
        </div>
      </div>
      <AdWarningsPanel warnings={airport.adWarnings || []} />
      <AiswebConditionVisuals
        parsed={visualParsed}
        rotaer={airport.rotaer}
        previewLabel={tafPreview?.label ?? null}
      />
    </div>
  );
}
