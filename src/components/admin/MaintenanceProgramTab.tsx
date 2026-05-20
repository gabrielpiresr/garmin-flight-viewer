import { useEffect, useState } from "react";
import { listModels } from "../../lib/aircraftModelsDb";
import type { AircraftModel } from "../../types/admin";
import { MaintenanceProgramPanel } from "./ModelsTab";
import { useToast } from "../ui/ToastProvider";

export function MaintenanceProgramTab() {
  const { showToast } = useToast();
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");

  useEffect(() => {
    listModels()
      .then((rows) => {
        setModels(rows);
        setSelectedModelId((current) => current || rows[0]?.id || "");
      })
      .catch((error: Error) => showToast({ variant: "error", message: error.message }));
  }, [showToast]);

  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Programa de Manutenção</h2>
          <p className="text-xs text-slate-500">Itens padrão vinculados ao modelo da aeronave.</p>
        </div>
        <label className="min-w-64" title="Selecione o modelo para editar o respectivo programa de manutenção.">
          <span className="mb-1 block text-xs text-slate-500">Modelo</span>
          <select
            value={selectedModelId}
            onChange={(event) => setSelectedModelId(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.manufacturer} {model.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedModel ? (
        <MaintenanceProgramPanel model={selectedModel} />
      ) : (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 py-16 text-center">
          <p className="text-sm text-slate-500">Nenhum modelo cadastrado.</p>
        </div>
      )}
    </div>
  );
}
