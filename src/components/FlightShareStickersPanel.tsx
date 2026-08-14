import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  buildCustomFlightShareSticker,
  buildFlightShareStickers,
  DEFAULT_CUSTOM_STICKER_OPTIONS,
  type CustomStickerOptions,
  type FlightShareData,
} from "../lib/flightShareStickers";
import { ShareStickersWorkspace, type ShareStickerControl } from "./ShareStickersModal";

const FlightFlyoverPanel = lazy(() =>
  import("./FlightFlyoverPanel").then((mod) => ({ default: mod.FlightFlyoverPanel })),
);

type Props = {
  shareData: FlightShareData | null;
  loading?: boolean;
  error?: string | null;
};

export function FlightShareStickersPanel({ shareData, loading = false, error = null }: Props) {
  const [readyShowBackground, setReadyShowBackground] = useState(true);
  const [customOptions, setCustomOptions] = useState<CustomStickerOptions>(DEFAULT_CUSTOM_STICKER_OPTIONS);

  const stickers = useMemo(
    () => shareData ? buildFlightShareStickers(shareData, { showBackground: readyShowBackground }) : [],
    [readyShowBackground, shareData],
  );
  const customSticker = useMemo(
    () => shareData ? buildCustomFlightShareSticker(shareData, customOptions) : null,
    [customOptions, shareData],
  );
  const updateCustomOptions = useCallback((patch: Partial<CustomStickerOptions>) => {
    setCustomOptions((current) => ({ ...current, ...patch }));
  }, []);
  const resetCustomOptions = useCallback(() => {
    setReadyShowBackground(true);
    setCustomOptions(DEFAULT_CUSTOM_STICKER_OPTIONS);
  }, []);

  const customControls = useMemo<ShareStickerControl[]>(() => [
    {
      kind: "text",
      id: "title",
      label: "Titulo opcional",
      value: customOptions.title,
      maxLength: 32,
      placeholder: "Sem titulo",
      onChange: (value) => updateCustomOptions({ title: value }),
    },
    {
      kind: "choice",
      id: "route",
      label: "Rota",
      value: customOptions.routeMode,
      options: [
        { value: "map", label: "Com mapa" },
        { value: "clean", label: "Sem mapa" },
        { value: "legs", label: "Pernas do voo" },
        { value: "hidden", label: "Ocultar rota" },
      ],
      onChange: (value) => updateCustomOptions({ routeMode: value as CustomStickerOptions["routeMode"] }),
    },
    { kind: "toggle", id: "distance", label: "Distancia", checked: customOptions.showDistance, onChange: (checked) => updateCustomOptions({ showDistance: checked }) },
    { kind: "toggle", id: "time", label: "Tempo", checked: customOptions.showTime, onChange: (checked) => updateCustomOptions({ showTime: checked }) },
    { kind: "toggle", id: "altitude", label: "Altitude maxima", checked: customOptions.showAltitude, onChange: (checked) => updateCustomOptions({ showAltitude: checked }) },
    { kind: "toggle", id: "speed", label: "Velocidade maxima", checked: customOptions.showSpeed, onChange: (checked) => updateCustomOptions({ showSpeed: checked }) },
    { kind: "toggle", id: "aircraft", label: "Aeronave", checked: customOptions.showAircraft, onChange: (checked) => updateCustomOptions({ showAircraft: checked }) },
    { kind: "toggle", id: "date", label: "Data", checked: customOptions.showDate, onChange: (checked) => updateCustomOptions({ showDate: checked }) },
    { kind: "toggle", id: "student", label: "Aluno", checked: customOptions.showStudent, onChange: (checked) => updateCustomOptions({ showStudent: checked }) },
    { kind: "toggle", id: "altitudeChart", label: "Grafico de altitude", checked: customOptions.showAltitudeChart, onChange: (checked) => updateCustomOptions({ showAltitudeChart: checked }) },
    { kind: "toggle", id: "speedChart", label: "Grafico de velocidade", checked: customOptions.showSpeedChart, onChange: (checked) => updateCustomOptions({ showSpeedChart: checked }) },
  ], [customOptions, updateCustomOptions]);

  return (
    <div className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/40">
      <ShareStickersWorkspace
        shareText="Confira meu voo."
        loading={loading}
        error={error}
        stickers={stickers}
        customSticker={customSticker}
        customControls={customControls}
        readyShowBackground={readyShowBackground}
        customShowBackground={customOptions.showBackground}
        onReadyShowBackgroundChange={setReadyShowBackground}
        onCustomShowBackgroundChange={(checked) => updateCustomOptions({ showBackground: checked })}
        onReset={resetCustomOptions}
        flyover={
          shareData ? (
            <Suspense fallback={<div className="flex min-h-[520px] items-center justify-center text-sm text-slate-400">Carregando Flyover...</div>}>
              <FlightFlyoverPanel shareData={shareData} shareText="Confira meu voo." />
            </Suspense>
          ) : undefined
        }
      />
    </div>
  );
}
