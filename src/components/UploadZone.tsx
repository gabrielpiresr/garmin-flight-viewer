import { useCallback } from "react";

type Props = {
  onText: (text: string, fileName: string) => void | Promise<void>;
  disabled?: boolean;
};

export function UploadZone({ onText, disabled }: Props) {
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f || disabled) return;
      const text = await f.text();
      await Promise.resolve(onText(text, f.name));
    },
    [onText, disabled],
  );

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 p-6 backdrop-blur">
      <p className="text-sm text-slate-300">
        Arraste o CSV exportado do Garmin ou escolha o arquivo. A primeira linha deve ser o cabeçalho
        (Latitude, Longitude, etc.).
      </p>
      <label
        className={`mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 transition ${
          disabled
            ? "cursor-not-allowed border-slate-600 bg-slate-900/30 opacity-60"
            : "cursor-pointer border-sky-500/40 bg-slate-950/50 hover:border-sky-400/70 hover:bg-slate-900/60"
        }`}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <span className="text-lg font-medium text-sky-300">Selecionar CSV</span>
        <span className="mt-1 text-sm text-slate-500">ou solte aqui</span>
      </label>
      <p className="mt-4 text-xs text-slate-500">
        Seus dados ficam no navegador — nada é enviado a um servidor.
      </p>
    </div>
  );
}
