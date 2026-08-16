import { useState } from "react";
import {
  emptyImagePayload,
  emptyMapPayload,
  emptyMcPayload,
  newMcOptionId,
  type ProvaImagePayload,
  type ProvaMapPayload,
  type ProvaMcPayload,
  type ProvaQuestion,
  type ProvaQuestionInput,
  type ProvaQuestionType,
} from "../../types/provas";
import { uploadProvaMedia } from "../../lib/provasDb";
import { ProvaExamMap } from "./ProvaExamMap";
import { ProvaImageAreaEditor } from "./ProvaImageAreaEditor";
import { ProvaQuestionPlay } from "./ProvaQuestionPlay";

type Props = {
  question: ProvaQuestion;
  onChange: (patch: Partial<ProvaQuestionInput>) => void;
  onDelete: () => void;
  embedded?: boolean;
};

export function ProvaQuestionEditor({ question, onChange, onDelete, embedded = false }: Props) {
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    const result = await uploadProvaMedia(file);
    setUploading(false);
    return result.data?.url ?? null;
  }

  function setType(type: ProvaQuestionType) {
    if (type === question.type) return;
    const payload = type === "mc" ? emptyMcPayload() : type === "map" ? emptyMapPayload() : emptyImagePayload();
    onChange({ type, payload });
  }

  return (
    <div className={embedded ? "space-y-4" : "space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
          {(
            [
              ["mc", "Múltipla escolha"],
              ["map", "Mapa"],
              ["image", "Imagem"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setType(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                question.type === id ? "bg-sky-500/20 text-sky-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300"
          >
            {preview ? "Editar" : "Visualizar como aluno"}
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200">
            Excluir
          </button>
        </div>
      </div>

      {preview ? (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">{question.title || "Sem título"}</h3>
          {question.description ? <p className="whitespace-pre-wrap text-sm text-slate-300">{question.description}</p> : null}
          <ProvaQuestionPlay
            question={{
              id: question.id,
              categoryId: question.categoryId,
              categoryName: "",
              type: question.type,
              title: question.title,
              description: question.description,
              payload: question.payload as unknown as Record<string, unknown>,
            }}
          />
        </div>
      ) : (
        <>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Título
            <input
              value={question.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Enunciado curto"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Descrição
            <textarea
              value={question.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Contexto, carta, referência..."
            />
          </label>

          {question.type === "mc" ? (
            <McEditor
              payload={question.payload as ProvaMcPayload}
              uploading={uploading}
              onUpload={upload}
              onChange={(payload) => onChange({ payload })}
            />
          ) : null}
          {question.type === "map" ? (
            <MapEditor payload={question.payload as ProvaMapPayload} onChange={(payload) => onChange({ payload })} />
          ) : null}
          {question.type === "image" ? (
            <ImageEditor
              payload={question.payload as ProvaImagePayload}
              uploading={uploading}
              onUpload={upload}
              onChange={(payload) => onChange({ payload })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function McEditor({
  payload,
  uploading,
  onUpload,
  onChange,
}: {
  payload: ProvaMcPayload;
  uploading: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onChange: (payload: ProvaMcPayload) => void;
}) {
  const options = payload.options?.length ? payload.options : emptyMcPayload().options;

  async function addImage(kind: "stem" | "option", optionId?: string, file?: File | null) {
    if (!file) return;
    const url = await onUpload(file);
    if (!url) return;
    if (kind === "stem") onChange({ ...payload, imageUrls: [...(payload.imageUrls || []), url] });
    else {
      onChange({
        ...payload,
        options: options.map((opt) => (opt.id === optionId ? { ...opt, imageUrl: url } : opt)),
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Imagens do enunciado</p>
        <label className="cursor-pointer rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300">
          {uploading ? "Enviando..." : "+ Imagem"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => void addImage("stem", undefined, e.target.files?.[0])} />
        </label>
      </div>
      {payload.imageUrls?.length ? (
        <div className="flex flex-wrap gap-2">
          {payload.imageUrls.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="h-20 rounded-lg object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-slate-950/80 px-1 text-[10px] text-white"
                onClick={() => onChange({ ...payload, imageUrls: payload.imageUrls.filter((item) => item !== url) })}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={option.id} className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <input
              type="radio"
              name={`correct-${option.id}`}
              checked={payload.correctOptionId === option.id}
              onChange={() => onChange({ ...payload, correctOptionId: option.id })}
              className="mt-2"
              title="Resposta certa"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={option.text}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    options: options.map((item) => (item.id === option.id ? { ...item, text: e.target.value } : item)),
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder={`Alternativa ${index + 1}`}
              />
              {option.imageUrl ? <img src={option.imageUrl} alt="" className="max-h-24 rounded-lg" /> : null}
              <label className="inline-flex cursor-pointer text-[11px] font-semibold text-slate-400">
                Imagem da alternativa
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void addImage("option", option.id, e.target.files?.[0])} />
              </label>
            </div>
            {options.length > 2 ? (
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-rose-300"
                onClick={() =>
                  onChange({
                    ...payload,
                    options: options.filter((item) => item.id !== option.id),
                    correctOptionId: payload.correctOptionId === option.id ? options.find((item) => item.id !== option.id)?.id || "" : payload.correctOptionId,
                  })
                }
              >
                Remover
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {options.length < 6 ? (
        <button
          type="button"
          onClick={() => {
            const id = newMcOptionId();
            onChange({ ...payload, options: [...options, { id, text: "" }] });
          }}
          className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300"
        >
          + Alternativa
        </button>
      ) : null}
      <p className="text-[11px] text-slate-500">Marque o círculo da resposta certa.</p>
    </div>
  );
}

function MapEditor({ payload, onChange }: { payload: ProvaMapPayload; onChange: (payload: ProvaMapPayload) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Posicione o enquadramento inicial, ligue as camadas que o aluno verá e desenhe a área correta (ex.: cidade de Itu).
      </p>
      <ProvaExamMap
        center={payload.center}
        zoom={payload.zoom}
        layersOn={payload.layersOn}
        mode="draw"
        polygon={payload.clickArea?.latLngs ?? []}
        heightClass="h-[520px]"
        basemap={payload.basemap}
        onLayersChange={(layersOn) => onChange({ ...payload, layersOn })}
        onViewChange={(view) => onChange({ ...payload, ...view })}
        onPolygonChange={(latLngs) => onChange({ ...payload, clickArea: { type: "polygon", latLngs } })}
        onBasemapChange={(basemap) => onChange({ ...payload, basemap })}
      />
      <p className="text-[11px] text-slate-500">
        Área com {payload.clickArea?.latLngs?.length ?? 0} ponto(s). Use pelo menos 3 para fechar o polígono.
      </p>
    </div>
  );
}

function ImageEditor({
  payload,
  uploading,
  onUpload,
  onChange,
}: {
  payload: ProvaImagePayload;
  uploading: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onChange: (payload: ProvaImagePayload) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">
        {uploading ? "Enviando..." : payload.imageUrl ? "Trocar imagem" : "Enviar imagem"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = await onUpload(file);
            if (url) onChange({ ...payload, imageUrl: url });
          }}
        />
      </label>
      <ProvaImageAreaEditor
        imageUrl={payload.imageUrl}
        polygon={payload.clickArea?.pctPoints ?? []}
        mode="draw"
        onChange={(pctPoints) => onChange({ ...payload, clickArea: { type: "polygon", pctPoints } })}
      />
    </div>
  );
}
