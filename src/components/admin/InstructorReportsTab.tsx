import { useCallback, useEffect, useMemo, useState } from "react";
import { listAdminFlightReports } from "../../lib/adminUsersDb";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { listGroundAircraftIdents } from "../../lib/aircraftDb";
import { listCancellationPenaltyAdjustmentsForInstructorReport, type CancellationPenaltyAdjustmentRow } from "../../lib/creditsDb";
import { listInstructorCosts } from "../../lib/instructorCostsDb";
import { listInstructorPaymentSnapshotsByFlightIds, type InstructorPaymentSnapshotRow } from "../../lib/instructorPaymentsDb";
import { getPdfBrand, getPdfBrandLogoSrc } from "../../lib/pdfBrand";
import type { AdminFlightReportRow, AdminFlightReportStatus } from "../../types/adminFlightReports";
import type { InstructorCosts } from "../../types/costs";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type PeriodPresetKey = "custom" | "thisMonth" | "lastMonth";
type InstructorReportEntryType = "flight" | "cancellation_penalty";
type InstructorReportRow = Partial<AdminFlightReportRow> & Pick<
  AdminFlightReportRow,
  "id" | "status" | "studentName" | "instructorName" | "instructorUserId" | "studentUserId" | "flightDate" | "startTime" | "aircraftIdent" | "aircraftNickname" | "modelId" | "modelName" | "durationSec" | "hours" | "landings"
> & {
  entryType: InstructorReportEntryType;
  isGroundSchool: boolean;
  baseHourlyRate: number;
  repasse: number;
  repasseSource: "snapshot" | "tabela" | "sem-valor";
  paymentSnapshot: InstructorPaymentSnapshotRow | null;
  cancellationPenaltyHours?: number;
  cancellationPenaltySharePct?: number;
};

type InstructorGroup = {
  instructorUserId: string;
  instructorName: string;
  rows: InstructorReportRow[];
  flightRows: InstructorReportRow[];
  groundRows: InstructorReportRow[];
  flightCount: number;
  totalHours: number;
  studentsCount: number;
  groundSchoolCount: number;
  totalLandings: number;
  totalRepasse: number;
  averageEvaluation: number | null;
  evaluatedFlights: number;
  telemetryCount: number;
};

const REPORT_PAGE_SIZE = 100;
const STATUS_OPTIONS: Array<{ key: AdminFlightReportStatus | "all"; label: string }> = [
  { key: "Realizado", label: "Realizados" },
  { key: "all", label: "Todos" },
  { key: "Confirmado", label: "Confirmados" },
  { key: "Pendente", label: "Pendentes" },
  { key: "Previsto", label: "Previstos" },
  { key: "Cancelado", label: "Cancelados" },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodForPreset(key: PeriodPresetKey): { fromDate: string; toDate: string } {
  const today = new Date();
  const todayIso = isoDate(today);
  if (key === "custom") return { fromDate: "", toDate: "" };
  if (key === "thisMonth") return { fromDate: `${todayIso.slice(0, 8)}01`, toDate: todayIso };
  const firstThisMonth = new Date(`${todayIso.slice(0, 8)}01T12:00:00`);
  firstThisMonth.setMonth(firstThisMonth.getMonth() - 1);
  const firstLastMonth = isoDate(firstThisMonth).slice(0, 8) + "01";
  const lastLastMonth = new Date(`${todayIso.slice(0, 8)}01T12:00:00`);
  lastLastMonth.setDate(0);
  return { fromDate: firstLastMonth, toDate: isoDate(lastLastMonth) };
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function fmtNumber(value: unknown, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: digits })
    : "";
}

function fmtInt(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("pt-BR") : "0";
}

function fmtCurrency(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";
}

function fmtHours(value: number): string {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeIdent(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function isGroundSchoolRow(row: AdminFlightReportRow, groundIdents: Set<string>): boolean {
  const ident = normalizeIdent(row.aircraftIdent);
  if (ident && groundIdents.has(ident)) return true;
  return /\bground(?:\s+school)?\b/i.test(`${row.modelName || ""} ${row.aircraftNickname || ""} ${row.aircraftIdent || ""}`);
}

function calculateRepasseFromCosts(row: AdminFlightReportRow, costs: InstructorCosts | undefined, isGroundSchool: boolean): number {
  const modelCost = costs?.modelCosts.find((item) => item.modelId === row.modelId);
  if (!modelCost) return 0;
  if (isGroundSchool) return Number(modelCost.groundSchoolRate || 0);
  const hours = row.durationSec ? row.durationSec / 3600 : row.hours || 0;
  const hourlyRate = row.isNight ? modelCost.hourlyNightRate : modelCost.hourlyDayRate;
  const fixedRate = row.isNight ? modelCost.fixedNightRate : modelCost.fixedDayRate;
  return Number(((Number(hourlyRate || 0) * hours) + Number(fixedRate || 0)).toFixed(2));
}

function baseHourlyRateFromCosts(row: Pick<AdminFlightReportRow, "modelId" | "isNight">, costs: InstructorCosts | undefined, isGroundSchool: boolean): number {
  if (isGroundSchool) return 0;
  const modelCost = costs?.modelCosts.find((item) => item.modelId === row.modelId);
  if (!modelCost) return 0;
  return Number(row.isNight ? modelCost.hourlyNightRate : modelCost.hourlyDayRate) || 0;
}

function cancellationPenaltySharePct(costs: InstructorCosts | undefined): number {
  const value = Number(costs?.cancellationPenaltySharePct);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
}

function cancellationRepasse(adjustment: CancellationPenaltyAdjustmentRow, costs: InstructorCosts | undefined): { baseHourlyRate: number; sharePct: number; repasse: number } {
  const modelCost = costs?.modelCosts.find((item) => item.modelId === adjustment.aircraftModelId);
  const baseHourlyRate = Number(adjustment.isNight ? modelCost?.hourlyNightRate : modelCost?.hourlyDayRate) || 0;
  const sharePct = cancellationPenaltySharePct(costs);
  const hours = Math.abs(Math.min(0, Number(adjustment.hours) || 0));
  return {
    baseHourlyRate,
    sharePct,
    repasse: Number(((baseHourlyRate * hours * sharePct) / 100).toFixed(2)),
  };
}

function makeCancellationReportRow(adjustment: CancellationPenaltyAdjustmentRow, costs: InstructorCosts | undefined): InstructorReportRow {
  const values = cancellationRepasse(adjustment, costs);
  return {
    id: `penalty-${adjustment.id}`,
    entryType: "cancellation_penalty",
    status: "Realizado",
    studentName: adjustment.studentName || adjustment.studentUserId || "Aluno",
    instructorName: adjustment.instructorName || adjustment.instructorUserId || "Instrutor",
    instructorUserId: adjustment.instructorUserId || null,
    studentUserId: adjustment.studentUserId || null,
    flightDate: adjustment.flightDate,
    startTime: adjustment.flightStartTime,
    aircraftIdent: adjustment.aircraftIdent || null,
    aircraftNickname: null,
    modelId: adjustment.aircraftModelId || null,
    modelName: adjustment.aircraftModelId || "Modelo não identificado",
    durationSec: null,
    hours: Math.abs(Math.min(0, Number(adjustment.hours) || 0)),
    landings: 0,
    isGroundSchool: false,
    baseHourlyRate: values.baseHourlyRate,
    repasse: values.repasse,
    repasseSource: values.repasse > 0 ? "tabela" : "sem-valor",
    paymentSnapshot: null,
    cancellationPenaltyHours: Math.abs(Math.min(0, Number(adjustment.hours) || 0)),
    cancellationPenaltySharePct: values.sharePct,
  };
}

function paymentTotal(payment: InstructorPaymentSnapshotRow | null, isGroundSchool: boolean): number | null {
  if (!payment) return null;
  if (payment.totalCalculated > 0) return payment.totalCalculated;
  if (!isGroundSchool && (payment.hourlyRateApplied > 0 || payment.fixedRateApplied > 0)) return payment.totalCalculated;
  return null;
}

function groupRows(rows: InstructorReportRow[]): InstructorGroup[] {
  const byInstructor = new Map<string, InstructorReportRow[]>();
  rows.forEach((row) => {
    const key = row.instructorUserId || `name:${row.instructorName || "Sem instrutor"}`;
    byInstructor.set(key, [...(byInstructor.get(key) ?? []), row]);
  });

  return Array.from(byInstructor.entries())
    .map(([instructorUserId, groupRowsValue]) => {
      const operationalRows = groupRowsValue.filter((row) => row.entryType === "flight");
      const flightRows = operationalRows.filter((row) => !row.isGroundSchool);
      const groundRows = groupRowsValue.filter((row) => row.isGroundSchool);
      const evaluationValues = groupRowsValue
        .map((row) => row.evalScoreAverage)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return {
        instructorUserId,
        instructorName: groupRowsValue[0]?.instructorName || "Sem instrutor",
        rows: groupRowsValue.sort((a, b) => `${a.flightDate || ""}${a.startTime || ""}`.localeCompare(`${b.flightDate || ""}${b.startTime || ""}`)),
        flightRows,
        groundRows,
        flightCount: flightRows.length,
        totalHours: flightRows.reduce((acc, row) => acc + (row.durationSec ? row.durationSec / 3600 : row.hours || 0), 0),
        studentsCount: new Set(groupRowsValue.map((row) => row.studentUserId || row.studentName).filter(Boolean)).size,
        groundSchoolCount: groundRows.length,
        totalLandings: flightRows.reduce((acc, row) => acc + (row.landings || 0), 0),
        totalRepasse: groupRowsValue.reduce((acc, row) => acc + row.repasse, 0),
        averageEvaluation: evaluationValues.length ? evaluationValues.reduce((acc, item) => acc + item, 0) / evaluationValues.length : null,
        evaluatedFlights: evaluationValues.length,
        telemetryCount: groupRowsValue.filter((row) => row.telemetry?.telemetryPresent || row.telemetryPresentOnDoc).length,
      };
    })
    .sort((a, b) => b.totalRepasse - a.totalRepasse || a.instructorName.localeCompare(b.instructorName, "pt-BR"));
}

function openInstructorReportPdf(group: InstructorGroup, fromDate: string, toDate: string) {
  const brand = getPdfBrand();
  const logoSrc = getPdfBrandLogoSrc(brand);
  const schoolName = brand.schoolName || "Escola de Aviação";
  const primary = brand.primaryColor || "#0f766e";
  const accent = brand.accentColor || "#0284c7";
  const period = `${fmtDate(fromDate)} a ${fmtDate(toDate)}`;
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const averageHours = group.flightCount ? group.totalHours / group.flightCount : 0;
  const rowsHtml = group.rows
    .map((row) => {
      const typeLabel = row.isGroundSchool ? "Ground school" : row.isNight ? "Voo noturno" : "Voo diurno";
      const isPenalty = row.entryType === "cancellation_penalty";
      return `<tr>
        <td>${escapeHtml(fmtDate(row.flightDate))}</td>
        <td>${escapeHtml(row.aircraftIdent || row.aircraftNickname || "-")}</td>
        <td>${escapeHtml(row.studentName || "-")}</td>
        <td>${escapeHtml(row.isGroundSchool || isPenalty ? "-" : fmtInt(row.landings))}</td>
        <td>${escapeHtml(row.isGroundSchool ? "Ground school" : fmtHours(row.durationSec ? row.durationSec / 3600 : row.hours || 0))}</td>
        <td>${escapeHtml(isPenalty ? `Multa de cancelamento (${fmtNumber(row.cancellationPenaltySharePct, 1)}%)` : row.missionName || row.trainingTrackName || typeLabel)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td class="money">${escapeHtml(fmtCurrency(row.baseHourlyRate))}</td>
        <td class="money">${escapeHtml(fmtCurrency(row.repasse))}</td>
      </tr>`;
    })
    .join("");
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Relatório do instrutor - ${escapeHtml(group.instructorName)}</title>
        <style>
          @page{size:A4;margin:12mm}
          *{box-sizing:border-box}
          body{margin:0;background:#fff;color:#0f172a;font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .cover{min-height:273mm;display:flex;flex-direction:column;justify-content:space-between;padding:12mm 4mm 4mm}
          .brand-row{display:flex;align-items:center;justify-content:space-between;gap:18px}
          .logo{max-width:190px;max-height:68px;object-fit:contain}
          .brand-text{font-size:13px;font-weight:800;text-transform:uppercase;color:#475569;letter-spacing:.08em}
          .hero{margin-top:42mm;border-left:8px solid ${escapeHtml(primary)};padding-left:18px}
          .kicker{margin:0 0 10px;color:${escapeHtml(accent)};font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}
          h1{margin:0;color:#0f172a;font-size:34px;line-height:1.08}
          .subtitle{margin:12px 0 0;color:#475569;font-size:15px;line-height:1.5}
          .cover-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:36mm}
          .meta-box{border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc}
          .meta-box span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:.08em}
          .meta-box strong{display:block;margin-top:4px;font-size:14px;color:#0f172a}
          .section{break-before:page;padding:4mm}
          h2{margin:0 0 14px;font-size:20px;color:#0f172a}
          .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:16px}
          .card{border:1px solid #dbe3ee;border-radius:10px;background:#f8fafc;padding:11px}
          .card span{display:block;color:#64748b;font-size:9px;text-transform:uppercase;font-weight:800;letter-spacing:.07em}
          .card strong{display:block;margin-top:5px;color:#0f172a;font-size:17px}
          table{width:100%;border-collapse:collapse;font-size:9px}
          th,td{border:1px solid #dbe3ee;padding:6px;text-align:left;vertical-align:top}
          th{background:#e2e8f0;color:#334155;font-size:8px;text-transform:uppercase;letter-spacing:.05em}
          tr:nth-child(even) td{background:#f8fafc}
          .money{text-align:right;font-weight:800;color:#065f46;white-space:nowrap}
          .footer{margin-top:12px;color:#64748b;font-size:9px;text-align:right}
        </style>
      </head>
      <body>
        <section class="cover">
          <div class="brand-row">
            ${logoSrc ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(schoolName)}" />` : `<div class="brand-text">${escapeHtml(schoolName)}</div>`}
            <div class="brand-text">Relatório financeiro</div>
          </div>
          <div class="hero">
            <p class="kicker">Instrutor</p>
            <h1>${escapeHtml(group.instructorName)}</h1>
            <p class="subtitle">Extrato de voos, ground school e repasses do período ${escapeHtml(period)}.</p>
          </div>
          <div class="cover-meta">
            <div class="meta-box"><span>Período</span><strong>${escapeHtml(period)}</strong></div>
            <div class="meta-box"><span>Gerado em</span><strong>${escapeHtml(generatedAt)}</strong></div>
            <div class="meta-box"><span>Valor a receber</span><strong>${escapeHtml(fmtCurrency(group.totalRepasse))}</strong></div>
            <div class="meta-box"><span>Registros</span><strong>${escapeHtml(fmtInt(group.rows.length))}</strong></div>
          </div>
        </section>
        <section class="section">
          <h2>Resumo</h2>
          <div class="summary-grid">
            <div class="card"><span>Voos</span><strong>${escapeHtml(fmtInt(group.flightCount))}</strong></div>
            <div class="card"><span>Horas de voo</span><strong>${escapeHtml(fmtHours(group.totalHours))}</strong></div>
            <div class="card"><span>Alunos</span><strong>${escapeHtml(fmtInt(group.studentsCount))}</strong></div>
            <div class="card"><span>Ground school</span><strong>${escapeHtml(fmtInt(group.groundSchoolCount))}</strong></div>
            <div class="card"><span>Valor a receber</span><strong>${escapeHtml(fmtCurrency(group.totalRepasse))}</strong></div>
            <div class="card"><span>Média das avaliações</span><strong>${escapeHtml(group.averageEvaluation === null ? "-" : fmtNumber(group.averageEvaluation, 1))}</strong></div>
            <div class="card"><span>Pousos</span><strong>${escapeHtml(fmtInt(group.totalLandings))}</strong></div>
            <div class="card"><span>Média por voo</span><strong>${escapeHtml(fmtHours(averageHours))}</strong></div>
          </div>
          <h2>Extrato de voos</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Avião</th>
                <th>Aluno</th>
                <th>Pousos</th>
                <th>Tempo de voo</th>
                <th>Missão / tipo</th>
                <th>Status</th>
                <th>Valor base/hora</th>
                <th>Repasse</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || `<tr><td colspan="9">Nenhum registro no período.</td></tr>`}</tbody>
          </table>
          <div class="footer">${escapeHtml(schoolName)} - ${escapeHtml(group.instructorName)} - ${escapeHtml(period)}</div>
        </section>
        <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
      </body>
    </html>`);
  printWindow.document.close();
  return true;
}

async function listAllInstructorReportRows(params: {
  fromDate: string;
  toDate: string;
  status: AdminFlightReportStatus | "all";
}): Promise<AdminFlightReportRow[]> {
  const byId = new Map<string, AdminFlightReportRow>();
  let cursor: string | null | undefined;
  let safety = 0;
  do {
    const page = await listAdminFlightReports({
      fromDate: params.fromDate || undefined,
      toDate: params.toDate || undefined,
      status: params.status,
      limit: REPORT_PAGE_SIZE,
      cursor,
      columns: [
        "status",
        "flightDate",
        "startTime",
        "studentName",
        "instructorName",
        "aircraftIdent",
        "aircraftNickname",
        "modelName",
        "missionName",
        "trainingTrackName",
        "durationSec",
        "hours",
        "landings",
        "telemetryPresent",
        "evaluationPresent",
        "evalScoreAverage",
      ],
      hydration: { telemetry: "none", landings: false, evaluations: true, mission: true },
    });
    page.flights.forEach((row) => byId.set(row.id, row));
    if (page.nextCursor === cursor) break;
    cursor = page.nextCursor;
    safety += 1;
  } while (cursor && safety < 200);
  return Array.from(byId.values());
}

export function InstructorReportsTab() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetKey>("thisMonth");
  const [fromDate, setFromDate] = useState(() => periodForPreset("thisMonth").fromDate);
  const [toDate, setToDate] = useState(() => periodForPreset("thisMonth").toDate);
  const [status, setStatus] = useState<AdminFlightReportStatus | "all">("Realizado");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<InstructorReportRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportRows, groundIdents, cancellationAdjustments] = await Promise.all([
        listAllInstructorReportRows({ fromDate, toDate, status }),
        listGroundAircraftIdents(DEFAULT_SCHOOL_ID),
        status === "all" || status === "Realizado" || status === "Cancelado"
          ? listCancellationPenaltyAdjustmentsForInstructorReport({ fromDate, toDate })
          : Promise.resolve([]),
      ]);
      const instructorIds = Array.from(new Set([
        ...reportRows.map((row) => row.instructorUserId).filter((id): id is string => Boolean(id)),
        ...cancellationAdjustments.map((row) => row.instructorUserId).filter((id): id is string => Boolean(id)),
      ]));
      const [payments, costs] = await Promise.all([
        listInstructorPaymentSnapshotsByFlightIds(reportRows.map((row) => row.id)),
        listInstructorCosts(instructorIds),
      ]);
      const paymentByFlightId = new Map(payments.map((payment) => [payment.flightId, payment]));
      const costsByInstructorId = new Map(costs.map((cost) => [cost.instructorUserId, cost]));
      const enriched = reportRows
        .filter((row) => row.instructorUserId || row.instructorName)
        .map((row) => {
          const isGroundSchool = isGroundSchoolRow(row, groundIdents);
          const paymentSnapshot = paymentByFlightId.get(row.id) ?? null;
          const snapshotTotal = paymentTotal(paymentSnapshot, isGroundSchool);
          const tableTotal = calculateRepasseFromCosts(
            row,
            row.instructorUserId ? costsByInstructorId.get(row.instructorUserId) : undefined,
            isGroundSchool,
          );
          const payable = row.status === "Realizado";
          const costs = row.instructorUserId ? costsByInstructorId.get(row.instructorUserId) : undefined;
          const repasse = payable ? snapshotTotal ?? tableTotal : 0;
          return {
            ...row,
            entryType: "flight",
            isGroundSchool,
            baseHourlyRate: paymentSnapshot?.hourlyRateApplied || baseHourlyRateFromCosts(row, costs, isGroundSchool),
            repasse,
            repasseSource: !payable ? "sem-valor" : snapshotTotal !== null ? "snapshot" : tableTotal > 0 ? "tabela" : "sem-valor",
            paymentSnapshot,
          } satisfies InstructorReportRow;
        });
      const cancellationRows = cancellationAdjustments.map((adjustment) => (
        makeCancellationReportRow(adjustment, adjustment.instructorUserId ? costsByInstructorId.get(adjustment.instructorUserId) : undefined)
      ));
      setRows([...enriched, ...cancellationRows]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível carregar os relatórios de instrutores.";
      setError(message);
      showToast({ variant: "error", message });
    } finally {
      setLoading(false);
    }
  }, [fromDate, showToast, status, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.instructorName,
        row.studentName,
        row.aircraftIdent,
        row.aircraftNickname,
        row.modelName,
        row.missionName,
        row.trainingTrackName,
      ].join(" ").toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [rows, search]);

  const groups = useMemo(() => groupRows(filteredRows), [filteredRows]);
  const totals = useMemo(
    () => ({
      instructors: groups.length,
      flights: groups.reduce((acc, group) => acc + group.flightCount, 0),
      hours: groups.reduce((acc, group) => acc + group.totalHours, 0),
      ground: groups.reduce((acc, group) => acc + group.groundSchoolCount, 0),
      repasse: groups.reduce((acc, group) => acc + group.totalRepasse, 0),
    }),
    [groups],
  );

  function setPresetPeriod(key: PeriodPresetKey) {
    setPeriodPreset(key);
    if (key === "custom") return;
    const next = periodForPreset(key);
    setFromDate(next.fromDate);
    setToDate(next.toDate);
  }

  if (loading && !rows.length) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Relatórios de Instrutores</h2>
          <p className="mt-1 text-xs text-slate-500">
            {fmtInt(totals.instructors)} instrutores · {fmtInt(totals.flights)} voos · {fmtHours(totals.hours)} · {fmtInt(totals.ground)} ground school · {fmtCurrency(totals.repasse)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,.6fr)_minmax(10rem,.6fr)_minmax(10rem,.7fr)]">
          <label className="text-xs text-slate-500">
            Pesquisar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Instrutor, aluno, avião ou missão"
              className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500"
            />
          </label>
          <label className="text-xs text-slate-500">
            Período
            <select
              value={periodPreset}
              onChange={(event) => setPresetPeriod(event.target.value as PeriodPresetKey)}
              className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="thisMonth">Esse mês</option>
              <option value="lastMonth">Mês passado</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AdminFlightReportStatus | "all")}
              className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              {STATUS_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              De
              <input
                type="date"
                value={fromDate}
                onChange={(event) => { setFromDate(event.target.value); setPeriodPreset("custom"); }}
                className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-xs text-slate-500">
              Até
              <input
                type="date"
                value={toDate}
                onChange={(event) => { setToDate(event.target.value); setPeriodPreset("custom"); }}
                className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300">Agrupado por instrutor</span>
          <span className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400">Repasse: apenas realizados, usando snapshot salvo ou tabela atual</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900">
              <tr>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Instrutor</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Voos</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Horas</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Alunos</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Ground school</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Média avaliações</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider text-slate-500">Valor a receber</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right font-semibold uppercase tracking-wider text-slate-500">Ação</th>
              </tr>
            </thead>
            <tbody>
              {!groups.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    Nenhum instrutor encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : groups.map((group) => (
                <tr key={group.instructorUserId} className="border-b border-slate-800/60 odd:bg-slate-950/20 hover:bg-slate-800/40">
                  <td className="border-b border-slate-800/60 px-3 py-3 text-slate-200">
                    <div className="font-semibold">{group.instructorName}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {fmtInt(group.rows.length)} registros no extrato
                      {group.rows.some((row) => row.status === "Realizado" && row.repasseSource === "sem-valor")
                        ? ` · ${fmtInt(group.rows.filter((row) => row.status === "Realizado" && row.repasseSource === "sem-valor").length)} sem repasse configurado`
                        : ""}
                    </div>
                  </td>
                  <td className="border-b border-slate-800/60 px-3 py-3 tabular-nums text-slate-300">{fmtInt(group.flightCount)}</td>
                  <td className="border-b border-slate-800/60 px-3 py-3 tabular-nums text-slate-300">{fmtHours(group.totalHours)}</td>
                  <td className="border-b border-slate-800/60 px-3 py-3 tabular-nums text-slate-300">{fmtInt(group.studentsCount)}</td>
                  <td className="border-b border-slate-800/60 px-3 py-3 tabular-nums text-slate-300">{fmtInt(group.groundSchoolCount)}</td>
                  <td className="border-b border-slate-800/60 px-3 py-3 tabular-nums text-slate-300">
                    {group.averageEvaluation === null ? "-" : fmtNumber(group.averageEvaluation, 1)}
                  </td>
                  <td className="border-b border-slate-800/60 px-3 py-3 tabular-nums font-semibold text-emerald-300">{fmtCurrency(group.totalRepasse)}</td>
                  <td className="border-b border-slate-800/60 px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        const ok = openInstructorReportPdf(group, fromDate, toDate);
                        if (!ok) showToast({ variant: "error", message: "Não foi possível abrir a janela de impressão do relatório." });
                      }}
                      className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Gerar relatório
                    </button>
                  </td>
                </tr>
              ))}
              {groups.length ? (
                <tr className="bg-slate-800/60 font-semibold text-slate-100">
                  <td className="border-t border-slate-700 px-3 py-2">Total</td>
                  <td className="border-t border-slate-700 px-3 py-2">{fmtInt(totals.flights)}</td>
                  <td className="border-t border-slate-700 px-3 py-2">{fmtHours(totals.hours)}</td>
                  <td className="border-t border-slate-700 px-3 py-2"></td>
                  <td className="border-t border-slate-700 px-3 py-2">{fmtInt(totals.ground)}</td>
                  <td className="border-t border-slate-700 px-3 py-2"></td>
                  <td className="border-t border-slate-700 px-3 py-2 text-emerald-300">{fmtCurrency(totals.repasse)}</td>
                  <td className="border-t border-slate-700 px-3 py-2"></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
