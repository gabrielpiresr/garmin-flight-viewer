import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  buildCustomJourneyShareSticker,
  buildJourneyShareStickers,
  DEFAULT_JOURNEY_CUSTOM_STICKER_OPTIONS,
  loadJourneyShareData,
  type JourneyCustomStickerOptions,
  type JourneyShareData,
  type JourneyShareMetricKey,
} from "../lib/journeyShareStickers";
import type { JourneyEvolutionPeriod } from "../lib/journeyMetrics";
import { ShareStickersModal, type ShareStickerControl } from "./ShareStickersModal";

type Props = {
  onClose: () => void;
};

export function JourneyShareStickersModal({ onClose }: Props) {
  const { user } = useAuth();
  const [shareData, setShareData] = useState<JourneyShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readyShowBackground, setReadyShowBackground] = useState(true);
  const [customOptions, setCustomOptions] = useState<JourneyCustomStickerOptions>(DEFAULT_JOURNEY_CUSTOM_STICKER_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    setShareData(null);
    setError(null);
    setReadyShowBackground(true);
    setCustomOptions(DEFAULT_JOURNEY_CUSTOM_STICKER_OPTIONS);

    if (!user) {
      setError("Usuario nao autenticado.");
      return () => {
        cancelled = true;
      };
    }

    void loadJourneyShareData({ userId: user.id, role: user.role })
      .then((next) => {
        if (!cancelled) setShareData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message || "Não foi possível preparar as figurinhas da jornada.");
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const stickers = useMemo(
    () => shareData ? buildJourneyShareStickers(shareData, { showBackground: readyShowBackground }) : [],
    [readyShowBackground, shareData],
  );
  const customSticker = useMemo(
    () => shareData ? buildCustomJourneyShareSticker(shareData, customOptions) : null,
    [customOptions, shareData],
  );
  const updateCustomOptions = useCallback((patch: Partial<JourneyCustomStickerOptions>) => {
    setCustomOptions((current) => ({ ...current, ...patch }));
  }, []);
  const resetCustomOptions = useCallback(() => {
    setReadyShowBackground(true);
    setCustomOptions(DEFAULT_JOURNEY_CUSTOM_STICKER_OPTIONS);
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
      id: "period",
      label: "Periodo",
      value: customOptions.period,
      options: [
        { value: "day", label: "Dia" },
        { value: "week", label: "Semana" },
        { value: "month", label: "Mês" },
      ],
      onChange: (value) => updateCustomOptions({ period: value as JourneyEvolutionPeriod }),
    },
    {
      kind: "choice",
      id: "metric",
      label: "Metrica do grafico",
      value: customOptions.metric,
      options: [
        { value: "hours", label: "Horas" },
        { value: "distanceNm", label: "Milhas" },
        { value: "landings", label: "Pousos" },
      ],
      onChange: (value) => updateCustomOptions({ metric: value as JourneyShareMetricKey }),
    },
    { kind: "toggle", id: "totals", label: "Totais", checked: customOptions.showTotals, onChange: (checked) => updateCustomOptions({ showTotals: checked }) },
    { kind: "toggle", id: "evolution", label: "Evolução", checked: customOptions.showEvolution, onChange: (checked) => updateCustomOptions({ showEvolution: checked }) },
    { kind: "toggle", id: "landings", label: "Pousos", checked: customOptions.showLandings, onChange: (checked) => updateCustomOptions({ showLandings: checked }) },
    { kind: "toggle", id: "takeoffs", label: "Decolagens", checked: customOptions.showTakeoffs, onChange: (checked) => updateCustomOptions({ showTakeoffs: checked }) },
    { kind: "toggle", id: "wind", label: "Vento", checked: customOptions.showWind, onChange: (checked) => updateCustomOptions({ showWind: checked }) },
    { kind: "toggle", id: "airports", label: "Aeroportos", checked: customOptions.showAirports, onChange: (checked) => updateCustomOptions({ showAirports: checked }) },
    { kind: "toggle", id: "level", label: "Nível e badges", checked: customOptions.showLevel, onChange: (checked) => updateCustomOptions({ showLevel: checked }) },
  ], [customOptions, updateCustomOptions]);

  return (
    <ShareStickersModal
      title="Compartilhar jornada"
      subtitle="Figurinhas transparentes para stories"
      ariaLabel="Compartilhar jornada"
      shareText="Confira minha jornada de voo."
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
