type Props = {
  className?: string;
  minHeight?: string;
  label?: string;
};

export function TelemetryProcessingProgress({
  className = "",
  minHeight,
  label = "Processando a telemetria",
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`flex flex-col items-center justify-center gap-4 px-4 ${className}`}
      style={minHeight ? { minHeight } : undefined}
    >
      <p className="text-sm font-medium text-sky-300">{label}</p>
      <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-800">
        <div className="telemetry-progress-bar h-full w-1/3 rounded-full bg-gradient-to-r from-sky-600 to-sky-400" />
      </div>
    </div>
  );
}

/** Overlay semitransparente para processamento sobre conteúdo já visível. */
export function TelemetryProcessingOverlay({ label }: { label?: string }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-950/75 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label={label ?? "Processando a telemetria"}
    >
      <TelemetryProcessingProgress className="py-8" label={label} />
    </div>
  );
}
