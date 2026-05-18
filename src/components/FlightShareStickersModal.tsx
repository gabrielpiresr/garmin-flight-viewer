import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildFlightShareStickers,
  buildCustomFlightShareSticker,
  DEFAULT_CUSTOM_STICKER_OPTIONS,
  loadFlightShareData,
  type CustomStickerOptions,
  type FlightShareData,
} from "../lib/flightShareStickers";
import { ShareStickersModal, type ShareStickerControl } from "./ShareStickersModal";

type Props = {
  flightId: string;
  onClose: () => void;
};

export function FlightShareStickersModal({ flightId, onClose }: Props) {
  const [shareData, setShareData] = useState<FlightShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readyShowBackground, setReadyShowBackground] = useState(true);
  const [customOptions, setCustomOptions] = useState<CustomStickerOptions>(DEFAULT_CUSTOM_STICKER_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    setShareData(null);
    setError(null);
    setReadyShowBackground(true);
    setCustomOptions(DEFAULT_CUSTOM_STICKER_OPTIONS);

    void loadFlightShareData(flightId)
      .then((next) => {
        if (!cancelled) setShareData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message || "Não foi possível preparar as figurinhas.");
      });

    return () => {
      cancelled = true;
    };
  }, [flightId]);

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
      label: "Título opcional",
      value: customOptions.title,
      maxLength: 32,
      placeholder: "Sem título",
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
    { kind: "toggle", id: "distance", label: "Distância", checked: customOptions.showDistance, onChange: (checked) => updateCustomOptions({ showDistance: checked }) },
    { kind: "toggle", id: "time", label: "Tempo", checked: customOptions.showTime, onChange: (checked) => updateCustomOptions({ showTime: checked }) },
    { kind: "toggle", id: "altitude", label: "Altitude máxima", checked: customOptions.showAltitude, onChange: (checked) => updateCustomOptions({ showAltitude: checked }) },
    { kind: "toggle", id: "speed", label: "Velocidade máxima", checked: customOptions.showSpeed, onChange: (checked) => updateCustomOptions({ showSpeed: checked }) },
    { kind: "toggle", id: "aircraft", label: "Aeronave", checked: customOptions.showAircraft, onChange: (checked) => updateCustomOptions({ showAircraft: checked }) },
    { kind: "toggle", id: "date", label: "Data", checked: customOptions.showDate, onChange: (checked) => updateCustomOptions({ showDate: checked }) },
    { kind: "toggle", id: "student", label: "Aluno", checked: customOptions.showStudent, onChange: (checked) => updateCustomOptions({ showStudent: checked }) },
    { kind: "toggle", id: "altitudeChart", label: "Gráfico de altitude", checked: customOptions.showAltitudeChart, onChange: (checked) => updateCustomOptions({ showAltitudeChart: checked }) },
    { kind: "toggle", id: "speedChart", label: "Gráfico de velocidade", checked: customOptions.showSpeedChart, onChange: (checked) => updateCustomOptions({ showSpeedChart: checked }) },
  ], [customOptions, updateCustomOptions]);

  return (
    <ShareStickersModal
      title="Compartilhar voo"
      subtitle="Figurinhas transparentes para stories"
      ariaLabel="Compartilhar voo"
      shareText="Confira meu voo."
      loading={!shareData && !error}
      error={error}
      stickers={stickers}
      customSticker={customSticker}
      customControls={customControls}
      readyShowBackground={readyShowBackground}
      customShowBackground={customOptions.showBackground}
      onReadyShowBackgroundChange={setReadyShowBackground}
      onCustomShowBackgroundChange={(checked) => updateCustomOptions({ showBackground: checked })}
      onReset={resetCustomOptions}
      onClose={onClose}
    />
  );
}
