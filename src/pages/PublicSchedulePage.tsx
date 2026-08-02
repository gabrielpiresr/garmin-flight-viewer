import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  DEFAULT_PUBLIC_DISPLAY_BOARD,
  loadPublicDisplayBoard,
  panelLabel,
  PUBLIC_DISPLAY_MAX_COLUMNS,
  PUBLIC_DISPLAY_PANEL_OPTIONS,
  PUBLIC_DISPLAY_ZOOM_OPTIONS,
  publicDisplayRootFontSize,
  savePublicDisplayBoard,
  type PublicDisplayBoardConfig,
  type PublicDisplayPanelId,
  type PublicDisplayZoomId,
} from "../lib/publicDisplayBoard";

const ScheduleFlightsTab = lazy(() =>
  import("../components/admin/ScheduleFlightsTab").then((module) => ({ default: module.ScheduleFlightsTab })),
);
const AiswebTab = lazy(() => import("../components/AiswebTab").then((module) => ({ default: module.AiswebTab })));
const ManuaisTab = lazy(() => import("../components/ManuaisTab").then((module) => ({ default: module.ManuaisTab })));
const ManobrasTab = lazy(() => import("../components/ManobrasTab").then((module) => ({ default: module.ManobrasTab })));
const PanelTab = lazy(() => import("../components/PanelTab").then((module) => ({ default: module.PanelTab })));
const PublicJourneyCatalogPanel = lazy(() =>
  import("../components/publicDisplay/PublicJourneyCatalogPanel").then((module) => ({
    default: module.PublicJourneyCatalogPanel,
  })),
);

function PublicScheduleLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

function PublicScheduleAccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center">
      <div className="max-w-md space-y-2">
        <p className="text-base font-semibold text-slate-200">Acesso restrito</p>
        <p className="text-sm text-slate-400">
          O display público está disponível apenas para administradores e instrutores.
        </p>
      </div>
    </div>
  );
}

function PanelFallback() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

function formatClock(now: Date): string {
  return now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(now: Date): string {
  return now.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function DisplayPanelContent({ panelId }: { panelId: PublicDisplayPanelId }) {
  switch (panelId) {
    case "escala":
      return <ScheduleFlightsTab publicDisplayMode boardPanel />;
    case "jornada":
      return <PublicJourneyCatalogPanel />;
    case "aisweb":
      return <AiswebTab />;
    case "manuais":
      return <ManuaisTab />;
    case "manobras":
      return <ManobrasTab className="w-full" />;
    case "painel":
      return <PanelTab />;
    default:
      return null;
  }
}

function ZoomControl({
  value,
  onChange,
}: {
  value: PublicDisplayZoomId;
  onChange: (zoom: PublicDisplayZoomId) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-2xl border border-slate-700 bg-slate-900/70 p-1"
      role="group"
      aria-label="Tamanho do texto"
    >
      {PUBLIC_DISPLAY_ZOOM_OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            title={option.label}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`min-h-10 min-w-11 rounded-xl px-2.5 text-sm font-bold transition ${
              active
                ? "bg-sky-500/20 text-sky-100"
                : "text-slate-400 active:bg-slate-800 active:text-slate-200"
            }`}
          >
            {option.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

function ColumnPanelPicker({
  panelId,
  columnIndex,
  columnCount,
  onSelect,
}: {
  panelId: PublicDisplayPanelId;
  columnIndex: number;
  columnCount: number;
  onSelect: (panelId: PublicDisplayPanelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Trocar conteúdo desta coluna"
        className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:border-slate-700 hover:bg-slate-800/60 active:bg-slate-800"
      >
        <span className="truncate text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
          {panelLabel(panelId)}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {columnCount > 1 ? (
        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {columnIndex + 1}/{columnCount}
        </span>
      ) : null}

      {open ? (
        <div
          role="listbox"
          aria-label={`Conteúdo da coluna ${columnIndex + 1}`}
          className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-[min(100%,20rem)] overflow-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/60"
        >
          {PUBLIC_DISPLAY_PANEL_OPTIONS.map((option) => {
            const active = option.id === panelId;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
                className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-slate-800/80 px-3 py-2.5 text-left last:border-b-0 ${
                  active ? "bg-sky-500/15 text-sky-100" : "text-slate-200 active:bg-slate-800"
                }`}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                {active ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Atual</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LayoutSettingsModal({
  draft,
  onChange,
  onClose,
  onSave,
}: {
  draft: PublicDisplayBoardConfig;
  onChange: (next: PublicDisplayBoardConfig) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const columnCount = draft.columns.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-display-layout-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="public-display-layout-title" className="text-xl font-bold text-slate-50">
              Layout do display
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Escolha até {PUBLIC_DISPLAY_MAX_COLUMNS} colunas e o conteúdo de cada uma. Ideal para a TV touch da escola.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl border border-slate-700 px-3 text-sm font-medium text-slate-300 active:bg-slate-800"
          >
            Fechar
          </button>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Zoom</p>
          <div className="grid grid-cols-3 gap-2">
            {PUBLIC_DISPLAY_ZOOM_OPTIONS.map((option) => {
              const active = draft.zoom === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ ...draft, zoom: option.id })}
                  className={`min-h-14 rounded-2xl border px-3 py-2 transition ${
                    active
                      ? "border-sky-400/60 bg-sky-500/15 text-sky-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-300 active:bg-slate-800"
                  }`}
                >
                  <p className="text-base font-black">{option.shortLabel}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{option.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Colunas</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: PUBLIC_DISPLAY_MAX_COLUMNS }, (_, index) => {
              const count = index + 1;
              const active = columnCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    const nextColumns = [...draft.columns];
                    while (nextColumns.length < count) nextColumns.push("escala");
                    onChange({ ...draft, columns: nextColumns.slice(0, count) });
                  }}
                  className={`min-h-14 rounded-2xl border text-lg font-black transition ${
                    active
                      ? "border-sky-400/60 bg-sky-500/15 text-sky-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-300 active:bg-slate-800"
                  }`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {draft.columns.map((panelId, columnIndex) => (
            <div key={`column-${columnIndex}`} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-200">Coluna {columnIndex + 1}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PUBLIC_DISPLAY_PANEL_OPTIONS.map((option) => {
                  const active = panelId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        const nextColumns = [...draft.columns];
                        nextColumns[columnIndex] = option.id;
                        onChange({ ...draft, columns: nextColumns });
                      }}
                      className={`min-h-16 rounded-2xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-slate-700 bg-slate-900/50 active:bg-slate-800"
                      }`}
                    >
                      <p className={`text-sm font-bold ${active ? "text-emerald-100" : "text-slate-100"}`}>
                        {option.label}
                      </p>
                      <p className="mt-1 text-xs leading-snug text-slate-500">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            className="min-h-12 flex-1 rounded-2xl bg-sky-500 px-4 text-sm font-bold text-white active:bg-sky-400 sm:flex-none sm:min-w-40"
          >
            Salvar layout
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({
                columns: [...DEFAULT_PUBLIC_DISPLAY_BOARD.columns],
                zoom: draft.zoom,
              })
            }
            className="min-h-12 rounded-2xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 active:bg-slate-800"
          >
            Só escala
          </button>
        </div>
      </div>
    </div>
  );
}

export function PublicSchedulePage() {
  const { user, loading } = useAuth();
  const [board, setBoard] = useState<PublicDisplayBoardConfig>(() => loadPublicDisplayBoard());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<PublicDisplayBoardConfig>(board);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = publicDisplayRootFontSize(board.zoom);
    return () => {
      root.style.fontSize = previous;
    };
  }, [board.zoom]);

  function persistBoard(next: PublicDisplayBoardConfig) {
    savePublicDisplayBoard(next);
    setBoard(next);
  }

  function updateColumnPanel(columnIndex: number, panelId: PublicDisplayPanelId) {
    const nextColumns = [...board.columns];
    nextColumns[columnIndex] = panelId;
    persistBoard({ ...board, columns: nextColumns });
  }

  function updateZoom(zoom: PublicDisplayZoomId) {
    persistBoard({ ...board, zoom });
  }

  if (loading) return <PublicScheduleLoading />;
  if (!user || (user.role !== "admin" && user.role !== "instrutor")) {
    return <PublicScheduleAccessDenied />;
  }

  const columnCount = board.columns.length;

  return (
    <div className="flex h-[100dvh] min-h-screen w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-slate-100 sm:text-base">
            Display da escola
          </p>
          <p className="truncate text-xs text-slate-500">
            {columnCount} coluna{columnCount === 1 ? "" : "s"} · toque no título da coluna para trocar
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-right sm:block">
            <p className="text-lg font-black tabular-nums leading-none text-slate-100">{formatClock(now)}</p>
            <p className="mt-1 text-[11px] capitalize text-slate-500">{formatDateLabel(now)}</p>
          </div>
          <ZoomControl value={board.zoom} onChange={updateZoom} />
          <button
            type="button"
            onClick={() => {
              setDraft(board);
              setSettingsOpen(true);
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 text-sm font-semibold text-sky-200 transition active:bg-sky-500/20"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.466.13.908.324 1.319.57l1.3-.747a1 1 0 011.173.2l.96.96a1 1 0 01.2 1.174l-.746 1.3c.247.41.44.853.57 1.319l1.473.294a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.57 1.319l.747 1.3a1 1 0 01-.2 1.173l-.96.96a1 1 0 01-1.174.2l-1.3-.746a6.953 6.953 0 01-1.319.57l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.957 6.957 0 01-1.319-.57l-1.3.746a1 1 0 01-1.174-.2l-.96-.96a1 1 0 01-.2-1.173l.746-1.3a6.95 6.95 0 01-.57-1.319l-1.473-.295A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.13-.466.323-.908.57-1.319l-.747-1.3a1 1 0 01.2-1.174l.96-.96a1 1 0 011.174-.2l1.3.747c.41-.247.853-.44 1.319-.57l.295-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            Layout
          </button>
        </div>
      </header>

      <div
        className={`grid min-h-0 flex-1 gap-2 p-2 sm:gap-3 sm:p-3 ${
          columnCount === 1
            ? "grid-cols-1"
            : columnCount === 2
              ? "grid-cols-1 md:grid-cols-2"
              : columnCount === 3
                ? "grid-cols-1 md:grid-cols-3"
                : "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
        }`}
      >
        {board.columns.map((panelId, index) => (
          <section
            key={`column-${index}-${panelId}`}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40"
          >
            <div className="relative z-20 flex shrink-0 items-center gap-2 border-b border-slate-800/80 px-2 py-1.5">
              <ColumnPanelPicker
                panelId={panelId}
                columnIndex={index}
                columnCount={columnCount}
                onSelect={(nextPanelId) => updateColumnPanel(index, nextPanelId)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 touch-pan-y">
              <Suspense fallback={<PanelFallback />}>
                <DisplayPanelContent panelId={panelId} />
              </Suspense>
            </div>
          </section>
        ))}
      </div>

      {settingsOpen ? (
        <LayoutSettingsModal
          draft={draft}
          onChange={setDraft}
          onClose={() => setSettingsOpen(false)}
          onSave={() => {
            persistBoard(draft);
            setSettingsOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
