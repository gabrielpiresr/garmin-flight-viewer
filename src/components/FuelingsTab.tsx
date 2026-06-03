import { useCallback, useEffect, useMemo, useState } from "react";
import { listAircrafts } from "../lib/aircraftDb";
import { SCHOOL_ID } from "../lib/appwrite";
import { createFueling, listFuelings, updateFueling } from "../lib/fuelingsDb";
import { downloadCsv } from "../lib/csvExport";
import { listFuelingResponsibleUsers, listFuelingStudents } from "../lib/rbac";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import type { Aircraft } from "../types/admin";
import type { AircraftFueling, FuelingPaymentMethod, FuelingResponsibleOption, FuelingStudentOption, FuelType } from "../types/fueling";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";
const PAYMENT_METHODS: FuelingPaymentMethod[] = ["Pix", "Crédito", "Débito", "Linha de crédito"];
const FUEL_TYPES: FuelType[] = ["AVGAS", "Jet A", "Jet A1"];

type FormState = {
  occurred_at: string;
  aerodrome: string;
  responsible_user_id: string;
  aircraft_id: string;
  quantity_liters: string;
  price_per_liter: string;
  total_value: string;
  payment_method: FuelingPaymentMethod;
  fuel_type: FuelType;
  student_user_id: string;
};

type NumericField = "quantity_liters" | "price_per_liter" | "total_value";

function nowLocalInput(): string {
  const date = new Date();
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseDecimal(value: string): number | null {
  const raw = value.trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportCsv(rows: AircraftFueling[]) {
  downloadCsv([
    [
      "Data e hora local",
      "Aeródromo",
      "Responsável",
      "Avião",
      "Quantidade de litros",
      "Valor por litro",
      "Valor total",
      "Forma de pagamento",
      "Combustível",
    ],
    ...rows.map((row) => [
      formatDateTime(row.occurred_at),
      row.aerodrome,
      row.responsible_name,
      row.aircraft_registration,
      formatNumber(row.quantity_liters),
      formatCurrency(row.price_per_liter),
      formatCurrency(row.total_value),
      row.payment_method,
      row.fuel_type,
    ]),
  ], "abastecimentos.csv");
}

function exportPdf(rows: AircraftFueling[]) {
  const body = rows
    .map(
      (row) => `<tr>
        <td>${htmlEscape(formatDateTime(row.occurred_at))}</td>
        <td>${htmlEscape(row.aerodrome)}</td>
        <td>${htmlEscape(row.responsible_name)}</td>
        <td>${htmlEscape(row.aircraft_registration)}</td>
        <td>${htmlEscape(formatNumber(row.quantity_liters))}</td>
        <td>${htmlEscape(formatCurrency(row.price_per_liter))}</td>
        <td>${htmlEscape(formatCurrency(row.total_value))}</td>
        <td>${htmlEscape(row.payment_method)}</td>
        <td>${htmlEscape(row.fuel_type)}</td>
      </tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Abastecimentos</title>
    <style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111827}
      h1{font-size:20px;margin:0 0 16px}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #d1d5db;padding:6px;text-align:left}
      th{background:#f3f4f6}
    </style></head><body>
    <h1>Abastecimentos</h1>
    <table><thead><tr><th>Data e hora local</th><th>Aeródromo</th><th>Responsável</th><th>Avião</th><th>Litros</th><th>Valor/L</th><th>Total</th><th>Pagamento</th><th>Combustível</th></tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

function emptyForm(currentUserId: string): FormState {
  return {
    occurred_at: nowLocalInput(),
    aerodrome: "",
    responsible_user_id: currentUserId,
    aircraft_id: "",
    quantity_liters: "",
    price_per_liter: "",
    total_value: "",
    payment_method: "Pix",
    fuel_type: "AVGAS",
    student_user_id: "",
  };
}

function recalculateFields(form: FormState, changed: NumericField): FormState {
  const q = parseDecimal(form.quantity_liters);
  const p = parseDecimal(form.price_per_liter);
  const t = parseDecimal(form.total_value);
  const next = { ...form };
  if (changed !== "total_value" && q !== null && p !== null) {
    next.total_value = (q * p).toFixed(2);
    return next;
  }
  if (changed !== "price_per_liter" && t !== null && q !== null && q !== 0) {
    next.price_per_liter = (t / q).toFixed(2);
    return next;
  }
  if (changed !== "quantity_liters" && t !== null && p !== null && p !== 0) {
    next.quantity_liters = (t / p).toFixed(2);
  }
  return next;
}

export function FuelingsTab() {
  const { user } = useAuth();
  const { canAction } = usePermissions();
  const { showToast } = useToast();
  const [fuelings, setFuelings] = useState<AircraftFueling[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [responsibles, setResponsibles] = useState<FuelingResponsibleOption[]>([]);
  const [students, setStudents] = useState<FuelingStudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFueling, setEditingFueling] = useState<AircraftFueling | null>(null);
  const [filters, setFilters] = useState({ aircraftId: "", responsibleUserId: "", studentUserId: "", fromDate: "", toDate: "" });
  const [form, setForm] = useState<FormState>(() => emptyForm(user?.id ?? ""));

  const canAccess = user?.role === "admin" || user?.role === "instrutor";

  const loadData = useCallback(async () => {
    if (!user || !canAccess) return;
    setLoading(true);
    try {
      const [fuelingRows, aircraftRows, responsibleRows, studentRows] = await Promise.all([
        listFuelings(schoolId, {
          aircraftId: filters.aircraftId || undefined,
          responsibleUserId: filters.responsibleUserId || undefined,
          studentUserId: filters.studentUserId || undefined,
          fromDate: filters.fromDate ? `${filters.fromDate}T00:00` : undefined,
          toDate: filters.toDate ? `${filters.toDate}T23:59` : undefined,
        }),
        listAircrafts(schoolId),
        listFuelingResponsibleUsers(user.role),
        listFuelingStudents(user.id, user.role),
      ]);
      setFuelings(fuelingRows);
      setAircraft(aircraftRows.filter((a) => a.type === "aviao"));
      setResponsibles(responsibleRows);
      setStudents(studentRows);
      setForm((current) => {
        const hasCurrentUser = responsibleRows.some((item) => item.userId === user.id);
        return {
          ...current,
          responsible_user_id: current.responsible_user_id || (hasCurrentUser ? user.id : responsibleRows[0]?.userId ?? ""),
        };
      });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message || "Não foi possível carregar abastecimentos." });
    } finally {
      setLoading(false);
    }
  }, [canAccess, filters.aircraftId, filters.fromDate, filters.responsibleUserId, filters.studentUserId, filters.toDate, showToast, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totals = useMemo(
    () => ({
      liters: fuelings.reduce((sum, row) => sum + row.quantity_liters, 0),
      value: fuelings.reduce((sum, row) => sum + row.total_value, 0),
    }),
    [fuelings],
  );

  function updateNumericField(field: NumericField, value: string) {
    setForm((current) => recalculateFields({ ...current, [field]: value }, field));
  }

  function openNewFueling() {
    setForm(emptyForm(user?.id ?? responsibles[0]?.userId ?? ""));
    setEditingFueling(null);
    setModalOpen(true);
  }

  function openEditFueling(row: AircraftFueling) {
    setEditingFueling(row);
    setForm({
      occurred_at: row.occurred_at.includes("T") ? row.occurred_at.slice(0, 16) : row.occurred_at.replace(" ", "T").slice(0, 16),
      aerodrome: row.aerodrome,
      responsible_user_id: row.responsible_user_id,
      aircraft_id: row.aircraft_id,
      quantity_liters: String(row.quantity_liters),
      price_per_liter: String(row.price_per_liter),
      total_value: String(row.total_value),
      payment_method: row.payment_method,
      fuel_type: row.fuel_type,
      student_user_id: row.student_user_id ?? "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !canAccess) return;
    const quantity = parseDecimal(form.quantity_liters);
    const price = parseDecimal(form.price_per_liter);
    const total = parseDecimal(form.total_value);
    const responsible = responsibles.find((item) => item.userId === form.responsible_user_id);
    const selectedAircraft = aircraft.find((item) => item.id === form.aircraft_id);
    const selectedStudent = students.find((item) => item.userId === form.student_user_id);
    if (!form.occurred_at || !form.aerodrome.trim() || !responsible || !selectedAircraft || quantity === null || price === null || total === null) {
      showToast({ variant: "warning", message: "Preencha data, aeródromo, responsável, avião e os valores calculáveis." });
      return;
    }
    if (quantity <= 0 || price <= 0 || total <= 0) {
      showToast({ variant: "warning", message: "Litros, valor por litro e valor total precisam ser maiores que zero." });
      return;
    }
    setSaving(true);
    try {
      if (editingFueling) {
        await updateFueling(
          editingFueling.id,
          {
            school_id: schoolId,
            occurred_at: form.occurred_at,
            aerodrome: form.aerodrome.trim().toUpperCase(),
            responsible_user_id: responsible.userId,
            responsible_name: responsible.label,
            aircraft_id: selectedAircraft.id,
            aircraft_registration: selectedAircraft.registration,
            quantity_liters: quantity,
            price_per_liter: Number(price.toFixed(2)),
            total_value: Number(total.toFixed(2)),
            payment_method: form.payment_method,
            fuel_type: form.fuel_type,
            student_user_id: selectedStudent?.userId ?? null,
            student_name: selectedStudent?.label ?? null,
            flight_id: editingFueling.flight_id,
            created_by: editingFueling.created_by || user.id,
          },
          { userId: user.id, role: user.role },
        );
        setModalOpen(false);
        setEditingFueling(null);
        showToast({ variant: "success", message: "Abastecimento atualizado." });
        await loadData();
        return;
      }
      await createFueling(
        {
          school_id: schoolId,
          occurred_at: form.occurred_at,
          aerodrome: form.aerodrome.trim().toUpperCase(),
          responsible_user_id: responsible.userId,
          responsible_name: responsible.label,
          aircraft_id: selectedAircraft.id,
          aircraft_registration: selectedAircraft.registration,
          quantity_liters: quantity,
          price_per_liter: Number(price.toFixed(2)),
          total_value: Number(total.toFixed(2)),
          payment_method: form.payment_method,
          fuel_type: form.fuel_type,
          student_user_id: selectedStudent?.userId ?? null,
          student_name: selectedStudent?.label ?? null,
          flight_id: null,
          created_by: user.id,
        },
        { userId: user.id, role: user.role },
      );
      setModalOpen(false);
      showToast({ variant: "success", message: "Abastecimento lançado." });
      await loadData();
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message || "Não foi possível lançar o abastecimento." });
    } finally {
      setSaving(false);
    }
  }

  if (!canAccess) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
        Acesso restrito a admins e instrutores.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-slate-500">
          {fuelings.length} registros filtrados · {formatNumber(totals.liters)} L · {formatCurrency(totals.value)}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportCsv(fuelings)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
            CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (!exportPdf(fuelings)) showToast({ variant: "error", message: "Permita pop-ups para exportar PDF." });
            }}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            PDF
          </button>
          {canAction("fueling.launch") && (
            <button type="button" onClick={openNewFueling} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
              Novo abastecimento
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/30 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-slate-400">
          Avião
          <select value={filters.aircraftId} onChange={(event) => setFilters((current) => ({ ...current, aircraftId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            <option value="">Todos</option>
            {aircraft.map((item) => (
              <option key={item.id} value={item.id}>{item.registration}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-400">
          De
          <input type="date" value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
        <label className="text-xs font-medium text-slate-400">
          Até
          <input type="date" value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
        <label className="text-xs font-medium text-slate-400">
          Responsável
          <select value={filters.responsibleUserId} onChange={(event) => setFilters((current) => ({ ...current, responsibleUserId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            <option value="">Todos</option>
            {responsibles.map((item) => (
              <option key={item.userId} value={item.userId}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-400">
          Aluno
          <select value={filters.studentUserId} onChange={(event) => setFilters((current) => ({ ...current, studentUserId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            <option value="">Todos</option>
            {students.map((item) => (
              <option key={item.userId} value={item.userId}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : fuelings.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
          Nenhum abastecimento encontrado para os filtros atuais.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Data/hora</th>
                  <th className="px-4 py-3">Aeródromo</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Avião</th>
                  <th className="px-4 py-3 text-right">Litros</th>
                  <th className="px-4 py-3 text-right">Valor/L</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Pagamento</th>
                  <th className="px-4 py-3">Combustível</th>
                  {canAction("fueling.edit") ? <th className="px-4 py-3 text-right">Ações</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {fuelings.map((row) => (
                  <tr key={row.id} className="text-slate-300">
                    <td className="px-4 py-3">{formatDateTime(row.occurred_at)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-100">{row.aerodrome}</td>
                    <td className="px-4 py-3">{row.responsible_name}</td>
                    <td className="px-4 py-3">{row.aircraft_registration}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.quantity_liters)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.price_per_liter)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-300">{formatCurrency(row.total_value)}</td>
                    <td className="px-4 py-3">{row.payment_method}</td>
                    <td className="px-4 py-3">{row.fuel_type}</td>
                    {canAction("fueling.edit") ? (
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openEditFueling(row)} className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">
                          Editar
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {fuelings.map((row) => (
              <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">{formatDateTime(row.occurred_at)}</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-100">{row.aircraft_registration} · {row.aerodrome}</h3>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">{row.fuel_type}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-slate-500">Responsável</dt><dd className="text-slate-200">{row.responsible_name}</dd></div>
                  <div><dt className="text-xs text-slate-500">Pagamento</dt><dd className="text-slate-200">{row.payment_method}</dd></div>
                  <div><dt className="text-xs text-slate-500">Litros</dt><dd className="text-slate-200">{formatNumber(row.quantity_liters)} L</dd></div>
                  <div><dt className="text-xs text-slate-500">Valor/L</dt><dd className="text-slate-200">{formatCurrency(row.price_per_liter)}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-slate-500">Valor total</dt><dd className="text-base font-semibold text-emerald-300">{formatCurrency(row.total_value)}</dd></div>
                </dl>
                {canAction("fueling.edit") ? (
                  <button type="button" onClick={() => openEditFueling(row)} className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
                    Editar
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form onSubmit={handleSubmit} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-2xl sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-100">{editingFueling ? "Editar abastecimento" : "Novo abastecimento"}</h3>
              <button type="button" onClick={() => { setModalOpen(false); setEditingFueling(null); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Fechar</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-300">Data e hora local<input required type="datetime-local" value={form.occurred_at} onChange={(event) => setForm((current) => ({ ...current, occurred_at: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" /></label>
              <label className="text-sm font-medium text-slate-300">Aeródromo<input required value={form.aerodrome} onChange={(event) => setForm((current) => ({ ...current, aerodrome: event.target.value.toUpperCase() }))} placeholder="SBJD" maxLength={8} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 uppercase text-slate-100" /></label>
              <label className="text-sm font-medium text-slate-300">Responsável<select required value={form.responsible_user_id} onChange={(event) => setForm((current) => ({ ...current, responsible_user_id: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">{responsibles.map((item) => <option key={item.userId} value={item.userId}>{item.label} ({item.role})</option>)}</select></label>
              <label className="text-sm font-medium text-slate-300">Avião<select required value={form.aircraft_id} onChange={(event) => setForm((current) => ({ ...current, aircraft_id: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"><option value="">Selecione</option>{aircraft.map((item) => <option key={item.id} value={item.id}>{item.registration}{item.nickname ? ` · ${item.nickname}` : ""}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-300">Quantidade de litros<input inputMode="decimal" value={form.quantity_liters} onChange={(event) => updateNumericField("quantity_liters", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" /></label>
              <label className="text-sm font-medium text-slate-300">Valor por litro<input inputMode="decimal" value={form.price_per_liter} onChange={(event) => updateNumericField("price_per_liter", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" /></label>
              <label className="text-sm font-medium text-slate-300">Valor total<input inputMode="decimal" value={form.total_value} onChange={(event) => updateNumericField("total_value", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" /></label>
              <label className="text-sm font-medium text-slate-300">Forma de pagamento<select required value={form.payment_method} onChange={(event) => setForm((current) => ({ ...current, payment_method: event.target.value as FuelingPaymentMethod }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-300">Combustível<select required value={form.fuel_type} onChange={(event) => setForm((current) => ({ ...current, fuel_type: event.target.value as FuelType }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">{FUEL_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-300">Aluno vinculado<select value={form.student_user_id} onChange={(event) => setForm((current) => ({ ...current, student_user_id: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"><option value="">Sem vínculo</option>{students.map((item) => <option key={item.userId} value={item.userId}>{item.label}</option>)}</select></label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setModalOpen(false); setEditingFueling(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
              <button disabled={saving} type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60">{saving ? "Salvando..." : editingFueling ? "Salvar alterações" : "Lançar abastecimento"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
