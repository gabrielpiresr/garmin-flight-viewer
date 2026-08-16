import type {
  ProvaImagePayload,
  ProvaLatLng,
  ProvaMapLayerId,
  ProvaMapPayload,
  ProvaMcPayload,
  ProvaPctPoint,
  ProvaSanitizedQuestion,
  ProvaStudentAnswer,
} from "../../types/provas";
import { ProvaExamMap } from "./ProvaExamMap";
import { ProvaImageAreaEditor } from "./ProvaImageAreaEditor";

type Props = {
  question: ProvaSanitizedQuestion;
  answer?: ProvaStudentAnswer | null;
  reveal?: Record<string, unknown> | null;
  disabled?: boolean;
  onAnswer?: (answer: ProvaStudentAnswer) => void;
};

function asMcPayload(payload: Record<string, unknown>): ProvaMcPayload {
  const options = Array.isArray(payload.options) ? (payload.options as ProvaMcPayload["options"]) : [];
  const imageUrls = Array.isArray(payload.imageUrls) ? (payload.imageUrls as string[]) : [];
  return { options, imageUrls, correctOptionId: String(payload.correctOptionId || "") };
}

function asMapPayload(payload: Record<string, unknown>): ProvaMapPayload {
  const center = (payload.center as ProvaLatLng) || { lat: -23.55, lng: -46.63 };
  const basemap = payload.basemap === "sat" || payload.basemap === "wac" ? payload.basemap : "map";
  return {
    center,
    zoom: typeof payload.zoom === "number" ? payload.zoom : 8,
    layersOn: (payload.layersOn as ProvaMapPayload["layersOn"]) || {},
    clickArea: { type: "polygon", latLngs: [] },
    basemap,
  };
}

function asImagePayload(payload: Record<string, unknown>): ProvaImagePayload {
  return {
    imageUrl: String(payload.imageUrl || ""),
    clickArea: { type: "polygon", pctPoints: [] },
  };
}

export function ProvaQuestionPlay({ question, answer, reveal, disabled, onAnswer }: Props) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  if (question.type === "mc") {
    const payload = asMcPayload(question.payload);
    const selected = answer?.type === "mc" ? answer.optionId : null;
    const correctId = reveal && typeof reveal.correctOptionId === "string" ? reveal.correctOptionId : null;
    return (
      <div className="space-y-4">
        {payload.imageUrls.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {payload.imageUrls.map((url) => (
              <img key={url} src={url} alt="" className="max-h-56 w-full rounded-xl object-contain bg-slate-950" />
            ))}
          </div>
        ) : null}
        <div className="grid gap-2">
          {payload.options.map((option, index) => {
            const isSelected = selected === option.id;
            const isCorrect = correctId === option.id;
            const isWrong = Boolean(correctId) && isSelected && !isCorrect;
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => onAnswer?.({ type: "mc", optionId: option.id })}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  isCorrect
                    ? "border-emerald-400/50 bg-emerald-500/15"
                    : isWrong
                      ? "border-rose-400/50 bg-rose-500/15"
                      : isSelected
                        ? "border-sky-400/50 bg-sky-500/15"
                        : "border-slate-700 bg-slate-900/50 hover:border-slate-500"
                }`}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                  {letters[index] ?? index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-100">{option.text || `Alternativa ${letters[index]}`}</span>
                  {option.imageUrl ? (
                    <img src={option.imageUrl} alt="" className="mt-2 max-h-32 rounded-lg object-contain" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (question.type === "map") {
    const payload = asMapPayload(question.payload);
    const point = answer?.type === "map" ? answer.latLng : null;
    const revealPoly =
      reveal && reveal.clickArea && typeof reveal.clickArea === "object"
        ? ((reveal.clickArea as { latLngs?: ProvaLatLng[] }).latLngs ?? null)
        : null;
    const allowed = Object.entries(payload.layersOn)
      .filter(([, on]) => on)
      .map(([id]) => id as ProvaMapLayerId);
    return (
      <ProvaExamMap
        center={payload.center}
        zoom={payload.zoom}
        layersOn={payload.layersOn}
        allowedLayerIds={allowed.length ? allowed : undefined}
        mode={revealPoly ? "review" : "click"}
        clickPoint={point}
        revealPolygon={revealPoly}
        basemap={payload.basemap}
        onClickPoint={disabled ? undefined : (latLng) => onAnswer?.({ type: "map", latLng })}
      />
    );
  }

  const payload = asImagePayload(question.payload);
  const point = answer?.type === "image" ? answer.pctPoint : null;
  const revealPoly =
    reveal && reveal.clickArea && typeof reveal.clickArea === "object"
      ? ((reveal.clickArea as { pctPoints?: ProvaPctPoint[] }).pctPoints ?? null)
      : null;
  return (
    <ProvaImageAreaEditor
      imageUrl={payload.imageUrl}
      polygon={[]}
      clickPoint={point}
      revealPolygon={revealPoly}
      mode={revealPoly ? "review" : "click"}
      onClickPoint={disabled ? undefined : (pctPoint) => onAnswer?.({ type: "image", pctPoint })}
    />
  );
}
