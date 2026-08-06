import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { searchAiswebAerodromes } from "../lib/aiswebDb";
import type { AiswebAerodromeMatch } from "../types/aisweb";
import { useToast } from "./ui/ToastProvider";

const searchInputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

function normalizeIcao(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function looksLikeIcaoCode(value: string): boolean {
  return /^[A-Za-z0-9]{4}$/.test(String(value || "").trim());
}

function formatAerodromeMatchLabel(match: AiswebAerodromeMatch): string {
  const city = String(match.city || "").trim();
  const name = String(match.name || "").trim();
  const uf = String(match.uf || "").trim().toUpperCase();
  const place = [city, uf].filter(Boolean).join("/");
  const showName =
    Boolean(name) &&
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() !==
      city
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
  return [match.icao, showName ? name : null, place ? `(${place})` : null].filter(Boolean).join(" ");
}

export function AiswebAerodromePicker({
  label,
  value,
  onChange,
  multiple = true,
  helper,
  disabled = false,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  helper?: string;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [lookupInput, setLookupInput] = useState("");
  const [lookupMatches, setLookupMatches] = useState<AiswebAerodromeMatch[]>([]);
  const [lookupHighlight, setLookupHighlight] = useState(0);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupSearching, setLookupSearching] = useState(false);
  const lookupContainerRef = useRef<HTMLDivElement | null>(null);
  const lookupSeqRef = useRef(0);

  const normalizedValue = useMemo(
    () => Array.from(new Set(value.map(normalizeIcao).filter((item) => item.length === 4))),
    [value],
  );
  const inputDisabled = disabled;

  useEffect(() => {
    const query = lookupInput.trim().slice(0, 80);
    if (query.length < 4 || disabled) {
      lookupSeqRef.current += 1;
      setLookupMatches([]);
      setLookupHighlight(0);
      setLookupSearching(false);
      return;
    }

    setLookupSearching(true);
    const seq = ++lookupSeqRef.current;
    const timer = window.setTimeout(() => {
      void searchAiswebAerodromes(query, 5)
        .then(({ matches }) => {
          if (seq !== lookupSeqRef.current) return;
          setLookupMatches(matches);
          setLookupHighlight(0);
          setLookupOpen(matches.length > 0);
          setLookupSearching(false);
        })
        .catch(() => {
          if (seq !== lookupSeqRef.current) return;
          setLookupMatches([]);
          setLookupOpen(false);
          setLookupSearching(false);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [disabled, lookupInput]);

  useEffect(() => {
    if (!lookupOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!lookupContainerRef.current?.contains(event.target as Node)) setLookupOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [lookupOpen]);

  function addIcao(raw: string) {
    const code = normalizeIcao(raw);
    if (!looksLikeIcaoCode(code)) {
      showToast({ variant: "warning", message: "Informe um ICAO válido com 4 caracteres ou escolha um resultado da busca." });
      return;
    }
    if (normalizedValue.includes(code)) {
      showToast({ variant: "warning", message: `${code} já foi adicionado.` });
      setLookupInput("");
      setLookupOpen(false);
      return;
    }

    onChange(multiple ? [...normalizedValue, code] : [code]);
    setLookupInput("");
    setLookupMatches([]);
    setLookupHighlight(0);
    setLookupOpen(false);
  }

  async function handleLookup() {
    const query = lookupInput.trim().slice(0, 80);
    if (!query) {
      showToast({ variant: "warning", message: "Informe um ICAO, cidade ou nome do aerodromo." });
      return;
    }

    if (lookupOpen && lookupMatches.length > 0) {
      const pick = lookupMatches[Math.min(lookupHighlight, lookupMatches.length - 1)] || lookupMatches[0];
      if (pick) {
        addIcao(pick.icao);
        return;
      }
    }

    if (looksLikeIcaoCode(query)) {
      addIcao(query);
      return;
    }

    if (query.length < 4) {
      showToast({ variant: "warning", message: "Digite ao menos 4 letras para buscar por cidade/nome." });
      return;
    }

    setLookupOpen(false);
    try {
      const { matches } = await searchAiswebAerodromes(query, 5);
      if (!matches.length) {
        showToast({ variant: "warning", message: `Nenhum aeródromo encontrado para "${query}".` });
        return;
      }
      if (matches.length === 1) {
        addIcao(matches[0].icao);
        return;
      }
      setLookupMatches(matches);
      setLookupHighlight(0);
      setLookupOpen(true);
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha na busca AISWEB." });
    }
  }

  function handleLookupKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setLookupOpen(false);
      return;
    }
    if (lookupOpen && lookupMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setLookupHighlight((prev) => (prev + 1) % lookupMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setLookupHighlight((prev) => (prev - 1 + lookupMatches.length) % lookupMatches.length);
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void handleLookup();
    }
  }

  function removeIcao(code: string) {
    if (disabled) return;
    onChange(normalizedValue.filter((item) => item !== code));
  }

  return (
    <div className="@container space-y-2">
      <label className="block text-xs font-medium text-slate-400">
        {label}
        <div className="mt-1 flex flex-wrap gap-2" ref={lookupContainerRef}>
          <div className="relative min-w-0 flex-1 basis-48">
            <input
              className={searchInputClass}
              value={lookupInput}
              maxLength={80}
              placeholder="Consultar ICAO, cidade ou nome"
              autoComplete="off"
              role="combobox"
              aria-expanded={lookupOpen}
              aria-controls={`${label}-aisweb-lookup-results`}
              aria-autocomplete="list"
              onChange={(event) => {
                setLookupInput(event.target.value.slice(0, 80));
                setLookupOpen(true);
              }}
              onFocus={() => {
                if (lookupMatches.length > 0 || lookupInput.trim().length >= 4) setLookupOpen(true);
              }}
              onKeyDown={handleLookupKeyDown}
              disabled={inputDisabled}
            />
            {lookupOpen && lookupInput.trim().length >= 4 ? (
              <div
                id={`${label}-aisweb-lookup-results`}
                role="listbox"
                className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 text-sm text-slate-100 shadow-xl shadow-slate-950/50"
              >
                {lookupSearching && lookupMatches.length === 0 ? <div className="px-3 py-2.5 text-xs text-slate-500">Buscando...</div> : null}
                {!lookupSearching && lookupMatches.length === 0 ? <div className="px-3 py-2.5 text-xs text-slate-500">Nenhum aeródromo encontrado</div> : null}
                {lookupMatches.map((match, index) => {
                  const active = index === lookupHighlight;
                  return (
                    <button
                      key={match.icao}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setLookupHighlight(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addIcao(match.icao);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                        active ? "bg-cyan-500/15 text-cyan-50" : "hover:bg-slate-800"
                      }`}
                    >
                      <span className="min-w-0 truncate">{formatAerodromeMatchLabel(match)}</span>
                      <span className="shrink-0 font-mono text-xs font-bold tracking-widest text-cyan-300">{match.icao}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button type="button" className={`${btnSecondary} grow @sm:grow-0`} onClick={() => void handleLookup()} disabled={inputDisabled || !lookupInput.trim()}>
            Adicionar
          </button>
        </div>
      </label>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
      <div className="flex min-h-9 flex-wrap gap-2">
        {normalizedValue.map((code) => (
          <span key={code} className="inline-flex items-center gap-2 rounded-md border border-cyan-800/60 bg-cyan-950/30 px-2.5 py-1 text-xs font-semibold text-cyan-200">
            <span className="font-mono tracking-widest">{code}</span>
            {!disabled ? (
              <button type="button" onClick={() => removeIcao(code)} className="text-cyan-400 hover:text-cyan-100" aria-label={`Remover ${code}`}>
                x
              </button>
            ) : null}
          </span>
        ))}
        {normalizedValue.length === 0 ? <span className="text-xs text-slate-600">Nenhum aeródromo selecionado.</span> : null}
      </div>
    </div>
  );
}
