import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SAGA_CREDIT_COLUMN_MAP,
  DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
  fetchSagaImportProgress,
  fetchSagaUsers,
  getSagaImportSettings,
  importSagaData,
  normalizeSagaCreditColumnMap,
  runSagaScheduleSyncNow,
  saveSagaImportMapping,
  type SagaImportScope,
  type SagaFinancialEntry,
  type SagaFlight,
  type SagaCredit,
  type SagaImportCatalogs,
  type SagaImportMapping,
  type SagaImportProgress,
  type SagaImportResult,
  type SagaImportSummary,
  type SagaUser,
} from "../../lib/sagaImportDb";
import { SagaImportProgressOverlay } from "./SagaImportProgressOverlay";
import { useSagaImportMissionPrompt } from "../../hooks/useSagaImportMissionPrompt";

type TableColumn<T> = { key: keyof T; label: string; className?: string };

const USER_COLUMNS: Array<TableColumn<SagaUser>> = [
  { key: "id", label: "ID" },
  { key: "nome", label: "Nome", className: "min-w-64" },
  { key: "email", label: "Email", className: "min-w-56" },
  { key: "codigoAnac", label: "Cod. ANAC" },
  { key: "cpf", label: "CPF" },
  { key: "nascimento", label: "Nascimento" },
  { key: "cma", label: "CMA" },
  { key: "habilitacao", label: "Habilitacao" },
  { key: "bases", label: "Bases" },
  { key: "perfil", label: "Perfil" },
  { key: "ultimoAcesso", label: "Ultimo acesso" },
  { key: "status", label: "Status" },
];


const FINANCE_COLUMNS: Array<TableColumn<SagaFinancialEntry>> = [
  { key: "id", label: "ID" },
  { key: "data", label: "Data" },
  { key: "cliente", label: "Cliente", className: "min-w-64" },
  { key: "natureza", label: "Natureza", className: "min-w-40" },
  { key: "valorTotal", label: "Valor Total" },
  { key: "banco", label: "Banco", className: "min-w-40" },
  { key: "status", label: "Status" },
];

const CREDIT_COLUMNS: Array<TableColumn<SagaCredit>> = [
  { key: "studentName", label: "Aluno", className: "min-w-64" },
  { key: "studentAnac", label: "ANAC" },
  { key: "model", label: "Modelo" },
  { key: "hours", label: "Creditos (h)" },
  { key: "hoursHhmm", label: "Creditos (hh:mm)" },
  { key: "hourlyValue", label: "Valor Hora" },
  { key: "totalValue", label: "Valor Total" },
  { key: "purchaseDate", label: "Data" },
  { key: "expiresAt", label: "Validade" },
  { key: "notes", label: "Obs", className: "min-w-48" },
  { key: "responsible", label: "Responsavel", className: "min-w-64" },
];

const EMPTY_MAPPING: SagaImportMapping = {
  aircraftBySaga: {},
  aircraftIdByRegistration: {},
  courseBySaga: {},
  missionBySaga: {},
  creditAircraftBySaga: {},
  flightColumnMap: DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
  creditColumnMap: DEFAULT_SAGA_CREDIT_COLUMN_MAP,
  sendFlightsToSaga: false,
  syncScheduleFromSaga: false,
  updatedAt: null,
};

const DEFAULT_IMPORT_SCOPE: SagaImportScope = {
  users: true,
  pastFlights: true,
  schedule: true,
  credits: true,
};

const EMPTY_CATALOGS: SagaImportCatalogs = {
  aircrafts: [],
  aircraftModels: [],
  trainingTracks: [],
};

function emptySagaImportResult(catalogs: SagaImportCatalogs): SagaImportResult {
  return {
    ok: false,
    users: [],
    flights: [],
    flightHeaders: [],
    flightColumnDefs: Object.entries(DEFAULT_SAGA_FLIGHT_COLUMN_MAP).map(([key, defaultIndex]) => ({
      key: key as keyof SagaFlight,
      label: key,
      defaultIndex,
    })),
    financialEntries: [],
    financialHeaders: [],
    credits: [],
    creditHeaders: [],
    creditColumnDefs: Object.entries(DEFAULT_SAGA_CREDIT_COLUMN_MAP).map(([key, defaultIndex]) => ({
      key: key as keyof SagaCredit,
      label: key,
      defaultIndex,
    })),
    creditPreviewSampledUserIds: [],
    usersJson: null,
    usersHtml: "",
    loginHtmlSnippet: "",
    usersHtmlSnippet: "",
    mapping: EMPTY_MAPPING,
    proposedMapping: {
      ...EMPTY_MAPPING,
      missingAircrafts: [],
      missingCourses: [],
      missingCreditAircrafts: [],
    },
    catalogs,
    statuses: {},
    locations: {},
    htmlLengths: {},
    logs: [],
  };
}

function applyColumnMapToFlight(flight: SagaFlight, columnMap: Record<string, number>): SagaFlight {
  const rawCells = flight.rawCells ?? [];
  const next = { ...flight, rawCells };
  for (const key of Object.keys(columnMap)) {
    const index = columnMap[key];
    if (Number.isInteger(index) && index >= 0) {
      (next as unknown as Record<string, string>)[key] = rawCells[index] ?? "";
    }
  }
  return next;
}

function applyColumnMapToFlights(flights: SagaFlight[], columnMap: Record<string, number>): SagaFlight[] {
  return flights.map((flight) => applyColumnMapToFlight(flight, columnMap));
}

function applyColumnMapToCredit(credit: SagaCredit, columnMap: Record<string, number>): SagaCredit {
  const rawCells = credit.rawCells ?? [];
  const next = { ...credit, rawCells };
  for (const key of Object.keys(columnMap)) {
    const index = columnMap[key];
    if (Number.isInteger(index) && index >= 0) {
      (next as unknown as Record<string, string>)[key] = rawCells[index] ?? "";
    }
  }
  return next;
}

function applyColumnMapToCredits(credits: SagaCredit[], columnMap: Record<string, number>): SagaCredit[] {
  return credits.map((credit) => applyColumnMapToCredit(credit, columnMap));
}

function statusLabel(result: SagaImportResult | null): string {
  if (!result) return "Aguardando chamada";
  const statuses = result.statuses ?? {};
  const parts = [
    statuses.preLogin ? `pre-login ${statuses.preLogin}` : "",
    statuses.login ? `login ${statuses.login}` : "",
    statuses.users ? `users/ajax ${statuses.users}` : "",
    statuses.operations ? `voos ${statuses.operations}` : "",
    statuses.cashier ? `financeiro ${statuses.cashier}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : "Sem status";
}

function newImportRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `saga-import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cellValue<T>(row: T, key: keyof T): string {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function flightGroupCount(flights: SagaFlight[]) {
  return new Set(flights.map((flight) => flight.id).filter(Boolean)).size;
}

function sagaFlightDateMs(flight: SagaFlight): number {
  const raw = String(flight.dataDoVoo || "").trim();
  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (brMatch) {
    const [, day, month, year, hour = "12", minute = "00"] = brMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function latestSagaFlights(flights: SagaFlight[], limit = 200): SagaFlight[] {
  return flights
    .map((flight, index) => ({ flight, index, dateMs: sagaFlightDateMs(flight) }))
    .sort((a, b) => (b.dateMs - a.dateMs) || (a.index - b.index))
    .slice(0, limit)
    .map((item) => item.flight);
}

function userSearchText(user: SagaUser): string {
  return [user.nome, user.email, user.codigoAnac, user.cpf, user.id].map((value) => String(value ?? "")).join(" ").toLowerCase();
}

function selectedUserIdsSet(ids: string[]): Set<string> {
  return new Set(ids.map((id) => String(id).trim()).filter(Boolean));
}

function DataTable<T>({
  title,
  subtitle,
  emptyText,
  rows,
  columns,
}: {
  title: string;
  subtitle: string;
  emptyText: string;
  rows: T[];
  columns: Array<TableColumn<T>>;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {rows.length ? (
        <div className="max-h-[42rem] overflow-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-widest text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={String(column.key)} className={`whitespace-nowrap px-3 py-2 font-semibold ${column.className ?? ""}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/30">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-800/40">
                  {columns.map((column) => {
                    const value = cellValue(row, column.key);
                    return (
                      <td key={String(column.key)} className="max-w-96 whitespace-nowrap px-3 py-2 text-slate-300">
                        <span className="block truncate" title={value}>{value}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      )}
    </section>
  );
}

function SagaStudentSelectionPanel({
  users,
  selectedIds,
  onChange,
}: {
  users: SagaUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const studentUsers = useMemo(
    () => users.filter((user) => String(user.id ?? "").trim() && !/instrutor|inva|diretor|admin/i.test(String(user.perfil ?? ""))),
    [users],
  );
  const selected = useMemo(() => selectedUserIdsSet(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return studentUsers;
    return studentUsers.filter((user) => userSearchText(user).includes(q));
  }, [query, studentUsers]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((user) => selected.has(String(user.id)));

  function toggle(userId: string) {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange(Array.from(next));
  }

  function setFiltered(checked: boolean) {
    const next = new Set(selected);
    for (const user of filtered) {
      const id = String(user.id ?? "").trim();
      if (!id) continue;
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange(Array.from(next));
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Alunos para importar</h3>
          <p className="mt-1 text-sm text-slate-500">
            Selecione alunos para limitar usuários, voos, créditos e escala. Sem seleção, o import continua trazendo todos.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar aluno, email ou ANAC"
            className="min-w-72 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => setFiltered(!allFilteredSelected)}
            disabled={!filtered.length}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {allFilteredSelected ? "Desmarcar filtrados" : "Marcar filtrados"}
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>{selected.size} selecionado(s)</span>
        <span>{filtered.length} exibido(s)</span>
        {selected.size ? (
          <button type="button" onClick={() => onChange([])} className="font-semibold text-sky-300 hover:text-sky-200">
            limpar seleção
          </button>
        ) : null}
      </div>
      {studentUsers.length ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-slate-800">
          {filtered.length ? filtered.map((user) => {
            const id = String(user.id ?? "").trim();
            const checked = selected.has(id);
            return (
              <label key={id} className="flex cursor-pointer items-center gap-3 border-b border-slate-800 px-3 py-2 last:border-b-0 hover:bg-slate-800/40">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(id)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-200">{user.nome || user.email || id}</span>
                  <span className="block truncate text-xs text-slate-500">{[user.codigoAnac ? `ANAC ${user.codigoAnac}` : "", user.email].filter(Boolean).join(" | ")}</span>
                </span>
              </label>
            );
          }) : (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Nenhum aluno encontrado na busca.</p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-500">
          Faça a busca no SAGA para listar os alunos.
        </p>
      )}
    </section>
  );
}

function MappingSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function MappingPanel({
  result,
  mapping,
  onMappingChange,
  onSave,
  saving,
}: {
  result: SagaImportResult;
  mapping: SagaImportMapping;
  onMappingChange: (mapping: SagaImportMapping) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const mappedFlights = applyColumnMapToFlights(result.flights, mapping.flightColumnMap);
  const creditColumnMap = normalizeSagaCreditColumnMap(mapping.creditColumnMap);
  const mappedCredits = applyColumnMapToCredits(result.credits, creditColumnMap);
  const aircraftValues = unique([...mappedFlights.map((flight) => flight.aeronave), ...Object.keys(mapping.aircraftBySaga)]);
  const courseValues = unique([...mappedFlights.map((flight) => flight.curso), ...Object.keys(mapping.courseBySaga)]);
  const creditAircraftValues = unique([...mappedCredits.map((credit) => credit.model), ...Object.keys(mapping.creditAircraftBySaga)]);
  const aircraftOptions = result.catalogs.aircrafts.map((aircraft) => ({
    value: aircraft.registration,
    label: [aircraft.registration, aircraft.nickname].filter(Boolean).join(" | "),
  }));
  const courseOptions = result.catalogs.trainingTracks.map((track) => ({
    value: track.id,
    label: track.name,
  }));
  const creditModelOptions = result.catalogs.aircraftModels.map((model) => ({
    value: model.id,
    label: [model.name, model.manufacturer].filter(Boolean).join(" | "),
  }));
  const missingAircrafts = aircraftValues.filter((value) => !mapping.aircraftBySaga[value]);
  const missingCourses = courseValues.filter((value) => !mapping.courseBySaga[value]);
  const missingCreditAircrafts = creditAircraftValues.filter((value) => !mapping.creditAircraftBySaga[value]);
  const sagaAircraftIdsCount = Object.values(mapping.aircraftIdByRegistration ?? {}).filter(Boolean).length;

  function setAircraft(sagaValue: string, localValue: string) {
    onMappingChange({
      ...mapping,
      aircraftBySaga: { ...mapping.aircraftBySaga, [sagaValue]: localValue },
    });
  }

  function setCourse(sagaValue: string, localValue: string) {
    onMappingChange({
      ...mapping,
      courseBySaga: { ...mapping.courseBySaga, [sagaValue]: localValue },
    });
  }

  function setCreditAircraft(sagaValue: string, localValue: string) {
    onMappingChange({
      ...mapping,
      creditAircraftBySaga: { ...mapping.creditAircraftBySaga, [sagaValue]: localValue },
    });
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">De-para para importacao</h3>
          <p className="mt-1 text-sm text-slate-500">
            Ajuste aeronaves e cursos existentes antes de gravar voos. O de-para fica salvo para as proximas execucoes.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar de-para"}
        </button>
      </div>

      {(missingAircrafts.length || missingCourses.length || missingCreditAircrafts.length) ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          Existem {missingAircrafts.length} aeronaves, {missingCourses.length} cursos e {missingCreditAircrafts.length} modelos de credito sem correspondencia.
        </p>
      ) : (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
          De-para completo para os voos carregados.
        </p>
      )}
      <p className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
        IDs de aeronave do SAGA resolvidos para envio de agenda: {sagaAircraftIdsCount}. Eles sao inferidos da escala do SAGA quando a busca encontra a aeronave correspondente.
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <div className="border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">Aeronaves</div>
          <div className="max-h-96 divide-y divide-slate-800 overflow-auto">
            {aircraftValues.map((sagaValue) => (
              <div key={sagaValue} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)] md:items-center">
                <span className="truncate text-sm text-slate-300" title={sagaValue}>{sagaValue}</span>
                <MappingSelect
                  value={mapping.aircraftBySaga[sagaValue] ?? ""}
                  onChange={(value) => setAircraft(sagaValue, value)}
                  options={aircraftOptions}
                  placeholder="Selecione a aeronave"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800">
          <div className="border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">Cursos</div>
          <div className="max-h-96 divide-y divide-slate-800 overflow-auto">
            {courseValues.map((sagaValue) => (
              <div key={sagaValue} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)] md:items-center">
                <span className="truncate text-sm text-slate-300" title={sagaValue}>{sagaValue}</span>
                <MappingSelect
                  value={mapping.courseBySaga[sagaValue] ?? ""}
                  onChange={(value) => setCourse(sagaValue, value)}
                  options={courseOptions}
                  placeholder="Selecione o curso"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800">
          <div className="border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">Movimentacoes de credito por modelo</div>
          <div className="max-h-96 divide-y divide-slate-800 overflow-auto">
            {creditAircraftValues.length ? creditAircraftValues.map((sagaValue) => (
              <div key={sagaValue} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)] md:items-center">
                <span className="truncate text-sm text-slate-300" title={sagaValue}>{sagaValue}</span>
                <MappingSelect
                  value={mapping.creditAircraftBySaga[sagaValue] ?? ""}
                  onChange={(value) => setCreditAircraft(sagaValue, value)}
                  options={creditModelOptions}
                  placeholder="Selecione o modelo"
                />
              </div>
            )) : (
              <p className="px-3 py-10 text-center text-sm text-slate-500">Nenhum credito carregado na amostra.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FlightMappingTable({
  result,
  mapping,
  onMappingChange,
}: {
  result: SagaImportResult | null;
  mapping: SagaImportMapping;
  onMappingChange: (mapping: SagaImportMapping) => void;
}) {
  const flightHeaders = result?.flightHeaders ?? [];
  const flights = applyColumnMapToFlights(result?.flights ?? [], mapping.flightColumnMap);
  const visibleFlights = latestSagaFlights(flights, 200);
  const defs = result?.flightColumnDefs?.length
    ? result.flightColumnDefs
    : Object.entries(DEFAULT_SAGA_FLIGHT_COLUMN_MAP).map(([key, defaultIndex]) => ({
        key: key as keyof SagaFlight,
        label: key,
        defaultIndex,
      }));
  const fieldOptions = defs.map((def) => ({ value: String(def.key), label: def.label }));
  const groups = flightGroupCount(flights);

  function fieldForColumn(colIdx: number): string {
    return Object.entries(mapping.flightColumnMap).find(([, idx]) => idx === colIdx)?.[0] ?? "";
  }

  function setFieldForColumn(colIdx: number, field: string) {
    if (!field) return;
    onMappingChange({
      ...mapping,
      flightColumnMap: { ...mapping.flightColumnMap, [field]: colIdx },
    });
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-100">Voos</h3>
        <p className="text-sm text-slate-500">
          {flightHeaders.length
            ? `${flights.length} pernas | ${groups} voos agrupados por ID SAGA. Exibindo os 200 mais recentes por data.`
            : "Nenhum voo extraido ainda."}
        </p>
      </div>
      {flightHeaders.length ? (
        <>
          <div className="max-h-[48rem] overflow-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-widest text-slate-500">
                <tr>
                  {flightHeaders.map((header, colIdx) => {
                    const currentField = fieldForColumn(colIdx);
                    return (
                      <th key={colIdx} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                        <div className="mb-1 text-slate-400">{header || `Col ${colIdx + 1}`}</div>
                        <select
                          value={currentField}
                          onChange={(e) => setFieldForColumn(colIdx, e.target.value)}
                          className="w-full min-w-28 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs normal-case tracking-normal text-slate-200 outline-none transition focus:border-sky-500"
                        >
                          <option value="">-- Nenhum --</option>
                          {fieldOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/30">
                {visibleFlights.map((flight, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-800/40">
                    {flightHeaders.map((_, colIdx) => {
                      const value = flight.rawCells?.[colIdx] ?? "";
                      return (
                        <td key={colIdx} className="max-w-64 whitespace-nowrap px-2 py-1.5 text-slate-300">
                          <span className="block truncate" title={value || "-"}>{value || "-"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {flights.length > visibleFlights.length && (
            <p className="mt-2 text-center text-xs text-slate-600">Exibindo {visibleFlights.length} de {flights.length} pernas, em ordem decrescente de data.</p>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-500">
          Faca a busca para visualizar os voos retornados pelo SAGA.
        </p>
      )}
    </section>
  );
}

function CreditMappingTable({
  result,
  mapping,
  onMappingChange,
}: {
  result: SagaImportResult | null;
  mapping: SagaImportMapping;
  onMappingChange: (mapping: SagaImportMapping) => void;
}) {
  const creditHeaders = result?.creditHeaders ?? [];
  const credits = result?.credits ?? [];
  const creditColumnMap = normalizeSagaCreditColumnMap(mapping.creditColumnMap);
  const defs = result?.creditColumnDefs?.length
    ? result.creditColumnDefs
    : Object.entries(DEFAULT_SAGA_CREDIT_COLUMN_MAP).map(([key, defaultIndex]) => ({
        key: key as keyof SagaCredit,
        label: key,
        defaultIndex,
      }));
  const fieldOptions = defs.map((def) => ({ value: String(def.key), label: def.label }));

  function fieldForColumn(colIdx: number): string {
    return Object.entries(creditColumnMap).find(([, idx]) => idx === colIdx)?.[0] ?? "";
  }

  function setFieldForColumn(colIdx: number, field: string) {
    if (!field) return;
    const nextColumnMap = { ...creditColumnMap };
    for (const key of Object.keys(nextColumnMap)) {
      if (nextColumnMap[key] === colIdx) delete nextColumnMap[key];
    }
    nextColumnMap[field] = colIdx;
    onMappingChange({
      ...mapping,
      creditColumnMap: nextColumnMap,
    });
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-100">Movimentacoes de credito SAGA</h3>
        <p className="text-sm text-slate-500">
          {creditHeaders.length
            ? `${credits.length} linhas de amostra. Ajuste o campo interno abaixo de cada coluna.`
            : "Nenhum credito extraido ainda."}
        </p>
      </div>
      {creditHeaders.length ? (
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-widest text-slate-500">
              <tr>
                {creditHeaders.map((header, colIdx) => (
                  <th key={colIdx} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                    <div className="mb-1 text-slate-400">{header || `Col ${colIdx + 1}`}</div>
                    <select
                      value={fieldForColumn(colIdx)}
                      onChange={(e) => setFieldForColumn(colIdx, e.target.value)}
                      className="w-full min-w-28 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs normal-case tracking-normal text-slate-200 outline-none transition focus:border-sky-500"
                    >
                      <option value="">-- Nenhum --</option>
                      {fieldOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/30">
              {credits.map((credit, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-800/40">
                  {creditHeaders.map((_, colIdx) => {
                    const value = credit.rawCells?.[colIdx] ?? "";
                    return (
                      <td key={colIdx} className="max-w-64 whitespace-nowrap px-2 py-1.5 text-slate-300">
                        <span className="block truncate" title={value || "-"}>{value || "-"}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-500">
          Faca a busca para visualizar a amostra de creditos retornada pelo SAGA.
        </p>
      )}
    </section>
  );
}

export function AdminImportTab() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<SagaImportResult | null>(null);
  const [mappingDraft, setMappingDraft] = useState<SagaImportMapping>(EMPTY_MAPPING);
  const [importSummary, setImportSummary] = useState<SagaImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [importing, setImporting] = useState<"test" | "selection" | "full" | null>(null);
  const [selectedSagaUserIds, setSelectedSagaUserIds] = useState<string[]>([]);
  const [useEmailAlias, setUseEmailAlias] = useState(true);
  const [catalogs, setCatalogs] = useState<SagaImportCatalogs>(EMPTY_CATALOGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [importProgress, setImportProgress] = useState<SagaImportProgress | null>(null);
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const [importScope, setImportScope] = useState<SagaImportScope>(DEFAULT_IMPORT_SCOPE);
  const [syncingScheduleNow, setSyncingScheduleNow] = useState(false);
  const {
    pendingMission,
    awaitingMission,
    onAwaitingMissionMapping,
    confirmMissionMapping,
    clearMissionPrompt,
    armMissionPromptFromProgress,
  } = useSagaImportMissionPrompt();

  const users = result?.users ?? [];
  const flights = useMemo(
    () => applyColumnMapToFlights(result?.flights ?? [], mappingDraft.flightColumnMap),
    [result?.flights, mappingDraft.flightColumnMap],
  );
  const credits = useMemo(
    () => applyColumnMapToCredits(result?.credits ?? [], normalizeSagaCreditColumnMap(mappingDraft.creditColumnMap)),
    [result?.credits, mappingDraft.creditColumnMap],
  );
  const financialEntries = result?.financialEntries ?? [];
  const logs = result?.logs ?? [];
  const mappingPanelResult = result ?? emptySagaImportResult(catalogs);
  const importModeLabel = importing === "selection" ? "Selecao" : importing === "test" ? "Teste" : "Completo";
  const displayPendingMission = pendingMission ?? importProgress?.pendingMission ?? null;

  useEffect(() => {
    let cancelled = false;
    setSettingsLoading(true);
    getSagaImportSettings()
      .then((settings) => {
        if (cancelled) return;
        setCatalogs(settings.catalogs);
        setMappingDraft({
          aircraftBySaga: settings.mapping.aircraftBySaga,
          aircraftIdByRegistration: settings.mapping.aircraftIdByRegistration ?? {},
          courseBySaga: settings.mapping.courseBySaga,
          missionBySaga: settings.mapping.missionBySaga ?? {},
          creditAircraftBySaga: settings.mapping.creditAircraftBySaga,
          flightColumnMap: settings.mapping.flightColumnMap,
          creditColumnMap: normalizeSagaCreditColumnMap(settings.mapping.creditColumnMap),
          sendFlightsToSaga: settings.mapping.sendFlightsToSaga === true,
          syncScheduleFromSaga: settings.mapping.syncScheduleFromSaga === true,
          updatedAt: settings.mapping.updatedAt,
        });
        setEmail(settings.credentials.email ?? "");
        setPassword(settings.credentials.password ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar configuracoes do import SAGA.");
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!importing) return;
    const timer = window.setInterval(() => setProgressTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [importing]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Informe email e senha do SAGA.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setImportSummary(null);
    setSelectedSagaUserIds([]);
    try {
      const next = await fetchSagaUsers({ email: cleanEmail, password, sendFlightsToSaga: mappingDraft.sendFlightsToSaga === true });
      setResult(next);
      setCatalogs(next.catalogs);
      setMappingDraft({
        aircraftBySaga: next.proposedMapping.aircraftBySaga,
        aircraftIdByRegistration: next.proposedMapping.aircraftIdByRegistration ?? {},
        courseBySaga: next.proposedMapping.courseBySaga,
        missionBySaga: mappingDraft.missionBySaga ?? {},
        creditAircraftBySaga: next.proposedMapping.creditAircraftBySaga,
        flightColumnMap: next.proposedMapping.flightColumnMap,
        creditColumnMap: normalizeSagaCreditColumnMap(next.proposedMapping.creditColumnMap),
        sendFlightsToSaga: next.proposedMapping.sendFlightsToSaga === true,
        syncScheduleFromSaga: next.proposedMapping.syncScheduleFromSaga === true,
        updatedAt: next.mapping.updatedAt,
      });
    } catch (err) {
      const sagaResult = (err as Error & { sagaResult?: SagaImportResult }).sagaResult;
      if (sagaResult) setResult(sagaResult);
      setError(err instanceof Error ? err.message : "Falha ao buscar dados no SAGA.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMapping() {
    setSavingMapping(true);
    setError(null);
    try {
      const saved = await saveSagaImportMapping({
        ...mappingDraft,
        creditColumnMap: normalizeSagaCreditColumnMap(mappingDraft.creditColumnMap),
      });
      setMappingDraft(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar de-para.");
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleImport(testMode: boolean, selectionOnly = false) {
    if (!result) return;
    const importRunId = newImportRunId();
    setImporting(testMode ? "test" : selectionOnly ? "selection" : "full");
    setError(null);
    setImportSummary(null);
    setImportStartedAt(Date.now());
    setImportProgress({
      runId: importRunId,
      status: "running",
      stage: "Enfileirando import",
      message: "Criando execucao no Appwrite.",
      current: 0,
      total: 1,
      logs: [],
    });
    try {
      const saved = await saveSagaImportMapping({
        ...mappingDraft,
        creditColumnMap: normalizeSagaCreditColumnMap(mappingDraft.creditColumnMap),
      });
      setMappingDraft(saved);
      const summary = await importSagaData({
        users,
        flights,
        financialEntries,
        mapping: saved,
        scope: importScope,
        testMode,
        email: email.trim(),
        password,
        selectedSagaUserIds: selectionOnly || selectedSagaUserIds.length ? selectedSagaUserIds : [],
        useEmailAlias,
        importRunId,
        onProgress: setImportProgress,
        onAwaitingMissionMapping,
      });
      setImportSummary(summary);
      setMappingDraft((current) => ({ ...current, missionBySaga: saved.missionBySaga ?? current.missionBySaga }));
    } catch (err) {
      const remoteProgress = await fetchSagaImportProgress(importRunId).catch(() => null);
      if (remoteProgress) setImportProgress(remoteProgress);
      const progressPending = remoteProgress?.pendingMission ?? importProgress?.pendingMission;
      if (armMissionPromptFromProgress(progressPending)) {
        setError("Selecione a missao local no modal para continuar o import.");
      } else {
        const progressMsg = remoteProgress?.status === "failed" ? remoteProgress.message : null;
        setError(progressMsg || (err instanceof Error ? err.message : "Falha ao importar dados."));
      }
    } finally {
      setImporting(null);
      setImportStartedAt(null);
      clearMissionPrompt();
    }
  }

  async function handleSyncScheduleNow() {
    setSyncingScheduleNow(true);
    setError(null);
    try {
      const result = await runSagaScheduleSyncNow(true);
      const imported = Number(result.imported || 0);
      const updated = Number(result.updated || 0);
      const students = Number(result.importedUsers?.students || 0);
      const instructors = Number(result.importedUsers?.instructors || 0);
      setError(
        `Sincronizacao manual concluida: ${imported} criados, ${updated} atualizados, ${students} alunos autoimportados, ${instructors} instrutores autoimportados.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sincronizar escala do SAGA agora.");
    } finally {
      setSyncingScheduleNow(false);
    }
  }

  return (
    <div className="space-y-4">
      <SagaImportProgressOverlay
        active={Boolean(importing) || awaitingMission || importProgress?.status === "failed"}
        awaitingMission={awaitingMission}
        modeLabel={importModeLabel}
        importProgress={importProgress}
        importStartedAt={importStartedAt}
        progressTick={progressTick}
        catalogs={catalogs}
        pendingMission={displayPendingMission}
        onConfirmMission={confirmMissionMapping}
      />
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Import SAGA</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Dados do SAGA</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Carrega usuarios e voos dos ultimos 24 meses, prepara o de-para e importa sem duplicar pelo ID do SAGA.
            </p>
            <label className="mt-4 flex max-w-3xl cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
              <input
                type="checkbox"
                checked={mappingDraft.sendFlightsToSaga === true}
                onChange={(event) => setMappingDraft((current) => ({ ...current, sendFlightsToSaga: event.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-100">Enviar voos ao SAGA</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Quando ligado, somente novos voos criados na nossa agenda tentam criar evento no SAGA. Voos antigos sem ID SAGA salvo nao serao alterados, recriados ou removidos.
                </span>
              </span>
            </label>
            <label className="mt-3 flex max-w-3xl cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
              <input
                type="checkbox"
                checked={mappingDraft.syncScheduleFromSaga === true}
                onChange={(event) => setMappingDraft((current) => ({ ...current, syncScheduleFromSaga: event.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-100">Sincronizar escala com o SAGA (job)</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Quando ligado, o backend executa sincronizacao periodica e importa eventos de hoje/futuro sem duplicar voos.
                </span>
              </span>
            </label>
            <div className="mt-3 flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
              <div>
                <span className="block text-sm font-semibold text-slate-100">Forcar sincronizacao da escala agora</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Executa sincronizacao imediata (independente do cron) e autoimporta aluno/instrutor ausente ao encontrar evento novo.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSyncScheduleNow}
                disabled={syncingScheduleNow || loading || settingsLoading}
                className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingScheduleNow ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_auto]">
            <label className="sr-only" htmlFor="saga-email">Email SAGA</label>
            <input
              id="saga-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email SAGA"
              className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
            />
            <label className="sr-only" htmlFor="saga-password">Senha SAGA</label>
            <input
              id="saga-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha"
              className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || settingsLoading}
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {settingsLoading ? "Carregando..." : loading ? "Buscando..." : "Buscar dados"}
            </button>
          </form>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</p>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Logs</h3>
            <p className="mt-1 text-sm text-slate-500">{statusLabel(result)}</p>
          </div>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${result?.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-950 text-slate-400"}`}>
            {result?.ok ? "OK" : "Teste"}
          </span>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs text-slate-300">
          {logs.length ? logs.map((line, index) => <p key={`${index}-${line}`}>{line}</p>) : <p className="text-slate-600">Os logs aparecerao aqui.</p>}
        </div>
      </section>

      <MappingPanel
        result={mappingPanelResult}
        mapping={mappingDraft}
        onMappingChange={setMappingDraft}
        onSave={handleSaveMapping}
        saving={savingMapping}
      />

      {result ? (
        <>
          <SagaStudentSelectionPanel
            users={users}
            selectedIds={selectedSagaUserIds}
            onChange={setSelectedSagaUserIds}
          />

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Importar para o sistema</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Modo teste importa os 5 primeiros voos realizados, 5 voos agendados futuros e apenas os alunos/instrutores relacionados a eles.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importScope.users}
                      onChange={(event) => setImportScope((current) => ({ ...current, users: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                    />
                    Usuarios
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importScope.pastFlights}
                      onChange={(event) => setImportScope((current) => ({ ...current, pastFlights: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                    />
                    Voos passados
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importScope.schedule}
                      onChange={(event) => setImportScope((current) => ({ ...current, schedule: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                    />
                    Escala
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importScope.credits}
                      onChange={(event) => setImportScope((current) => ({ ...current, credits: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                    />
                    Creditos
                  </label>
                </div>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={useEmailAlias}
                    onChange={(event) => setUseEmailAlias(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                  />
                  Usar alias de email no import
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleImport(true)}
                  disabled={Boolean(importing) || !flights.length || !Object.values(importScope).some(Boolean)}
                  className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing === "test" ? "Importando..." : "Importar teste"}
                </button>
                <button
                  type="button"
                  onClick={() => handleImport(false, true)}
                  disabled={Boolean(importing) || !flights.length || !selectedSagaUserIds.length || !Object.values(importScope).some(Boolean)}
                  className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing === "selection" ? "Importando..." : "Importar seleção"}
                </button>
                <button
                  type="button"
                  onClick={() => handleImport(false)}
                  disabled={Boolean(importing) || !flights.length || !Object.values(importScope).some(Boolean)}
                  className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing === "full" ? "Importando..." : "Importar tudo"}
                </button>
              </div>
            </div>
            {importSummary ? (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Usuarios</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.usersCreated} criados | {importSummary.usersUpdated} atualizados</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Voos</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.flightsCreated} criados | {importSummary.flightsUpdated} atualizados</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Duplicados</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.duplicateFlights}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Agendados</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.scheduledFlightsCreated ?? 0} criados | {importSummary.scheduledFlightsUpdated ?? 0} atual.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Ignorados</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.flightsSkipped}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">ANAC</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.anacSynced} ok | {importSummary.anacPending} pend.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Creditos</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.creditsCreated} criados | {importSummary.creditsUpdated} atual.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Financeiro</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.financialCreditsCreated ?? 0} criados | {importSummary.financialCreditsUpdated ?? 0} atual.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Horas credito</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{importSummary.creditHoursImported}h</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Creditos noturnos</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">
                    {importSummary.nightCreditRecordsCreated ?? 0} ordens | {importSummary.nightHoursReclassified ?? 0}h
                  </p>
                </div>
                <div className="md:col-span-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300">
                  {importSummary.logs.map((line) => <p key={line}>{line}</p>)}
                  {importSummary.missing.aircrafts.length ? <p>Aeronaves sem de-para: {importSummary.missing.aircrafts.join(", ")}</p> : null}
                  {importSummary.missing.courses.length ? <p>Cursos sem de-para: {importSummary.missing.courses.join(", ")}</p> : null}
                  {importSummary.missing.students.length ? <p>Alunos sem usuario importado/localizado: {importSummary.missing.students.join(", ")}</p> : null}
                  {importSummary.missing.creditAircrafts.length ? <p>Modelos de credito sem de-para: {importSummary.missing.creditAircrafts.join(", ")}</p> : null}
                </div>
                {importSummary.skippedFlights.length ? (
                  <div className="md:col-span-4 overflow-hidden rounded-xl border border-slate-800">
                    <div className="border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                      Voos nao importados
                    </div>
                    <div className="max-h-80 overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-widest text-slate-500">
                          <tr>
                            <th className="px-3 py-2">ID</th>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2">Aluno</th>
                            <th className="px-3 py-2">Aeronave</th>
                            <th className="px-3 py-2">Curso</th>
                            <th className="px-3 py-2">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900/30">
                          {importSummary.skippedFlights.map((flight) => (
                            <tr key={`${flight.id}-${flight.reason}`}>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-300">{flight.id}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-300">{flight.date || "-"}</td>
                              <td className="min-w-56 px-3 py-2 text-slate-300">{flight.student || "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-300">{flight.aircraft || "-"}</td>
                              <td className="min-w-56 px-3 py-2 text-slate-300">{flight.course || "-"}</td>
                              <td className="min-w-64 px-3 py-2 text-amber-100">{flight.message || flight.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                {importSummary.skippedCredits.length ? (
                  <div className="md:col-span-4 overflow-hidden rounded-xl border border-slate-800">
                    <div className="border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                      Creditos nao importados
                    </div>
                    <div className="max-h-80 overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-widest text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Aluno</th>
                            <th className="px-3 py-2">Modelo</th>
                            <th className="px-3 py-2">Creditos</th>
                            <th className="px-3 py-2">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900/30">
                          {importSummary.skippedCredits.map((credit, index) => (
                            <tr key={`${credit.student}-${credit.model}-${index}`}>
                              <td className="min-w-56 px-3 py-2 text-slate-300">{credit.student || "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-300">{credit.model || "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-300">{credit.hours || "-"}</td>
                              <td className="min-w-64 px-3 py-2 text-amber-100">{credit.message || credit.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      <DataTable
        title="Usuarios"
        subtitle={result?.usersJson ? `${users.length} exibidos | ${result.usersJson.recordsFiltered} filtrados | ${result.usersJson.recordsTotal} totais` : "Nenhum usuario carregado ainda."}
        emptyText="Faca a busca para visualizar os usuarios retornados pelo SAGA."
        rows={users}
        columns={USER_COLUMNS}
      />

      <FlightMappingTable
        result={result}
        mapping={mappingDraft}
        onMappingChange={setMappingDraft}
      />

      <CreditMappingTable
        result={result}
        mapping={mappingDraft}
        onMappingChange={setMappingDraft}
      />

      <DataTable
        title="Creditos dos alunos"
        subtitle={`${credits.length} linhas de amostra extraidas de /credits/create. Na importacao completa, os alunos importados sao processados em fila.`}
        emptyText="Nenhum credito extraido ainda."
        rows={credits}
        columns={CREDIT_COLUMNS}
      />

      <DataTable
        title="Lancamentos financeiros"
        subtitle={`${financialEntries.length} lancamentos extraidos de /finance/cashier. Na importacao, viram creditos quando o aluno e as horas/modelo forem identificados.`}
        emptyText="Nenhum lancamento financeiro extraido ainda."
        rows={financialEntries}
        columns={FINANCE_COLUMNS}
      />
    </div>
  );
}
