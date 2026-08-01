import type { PanelInstrument, PanelSeedTemplate } from "../types/panel";

function inst(
  partial: Omit<PanelInstrument, "sort_order"> & { sort_order?: number },
  order: number,
): PanelInstrument {
  return { ...partial, sort_order: partial.sort_order ?? order };
}

const GLASS_INSTRUMENTS: PanelInstrument[] = [
  inst(
    {
      id: "glass-g3x",
      name: "Garmin G3X Touch",
      description:
        "Display principal de voo (PFD) com mapa integrado. Mostra atitude, velocidade, altitude, direção e monitoramento do motor.",
      shape: "rect",
      x: 4,
      y: 12,
      w: 38,
      h: 62,
      zoom_image_url: "/panels/montaer-glass-g3x.png",
    },
    1,
  ),
  inst(
    {
      id: "glass-autopilot",
      name: "Autopiloto",
      description: "Painel de controle do piloto automático (AP, FD, NAV, ALT e demais modos).",
      shape: "rect",
      x: 43,
      y: 8,
      w: 16,
      h: 12,
      zoom_image_url: null,
    },
    2,
  ),
  inst(
    {
      id: "glass-g5",
      name: "Garmin G5 (backup)",
      description: "Instrumento eletrônico de backup com horizonte artificial, velocidade e altitude.",
      shape: "rect",
      x: 44,
      y: 22,
      w: 14,
      h: 28,
      zoom_image_url: "/panels/montaer-glass-g5.png",
    },
    3,
  ),
  inst(
    {
      id: "glass-radio",
      name: "Rádio COM/NAV",
      description: "Unidade de comunicação e navegação (ex.: Garmin GNC) com frequências ativa e standby.",
      shape: "rect",
      x: 42,
      y: 52,
      w: 18,
      h: 16,
      zoom_image_url: "/panels/montaer-glass-radio.png",
    },
    4,
  ),
  inst(
    {
      id: "glass-ipad",
      name: "Tablet de navegação",
      description: "Tablet com carta aeronáutica / app de navegação montado no lado direito do painel.",
      shape: "rect",
      x: 64,
      y: 10,
      w: 30,
      h: 55,
      zoom_image_url: "/panels/montaer-glass-ipad.png",
    },
    5,
  ),
  inst(
    {
      id: "glass-magneto",
      name: "Magneto / Ignition",
      description: "Seletor de magnetos e chave de ignição no lado esquerdo do painel.",
      shape: "circle",
      x: 1,
      y: 55,
      w: 8,
      h: 18,
      zoom_image_url: null,
    },
    6,
  ),
  inst(
    {
      id: "glass-switches",
      name: "Painel de switches",
      description:
        "Fileira inferior de breakers e switches (aviônicos, bomba, luzes, etc.). Use a imagem ampliada para estudar os rótulos.",
      shape: "rect",
      x: 12,
      y: 78,
      w: 70,
      h: 16,
      zoom_image_url: "/panels/montaer-glass-switches.png",
    },
    7,
  ),
];

const ANALOG_INSTRUMENTS: PanelInstrument[] = [
  inst(
    {
      id: "analog-asi",
      name: "Velocímetro (ASI)",
      description: "Indicador de velocidade indicada (kt) — instrumento circular analógico.",
      shape: "circle",
      x: 8,
      y: 18,
      w: 11,
      h: 28,
      zoom_image_url: "/panels/montaer-analog-asi.png",
    },
    1,
  ),
  inst(
    {
      id: "analog-g5",
      name: "Garmin G5",
      description: "PFD eletrônico com horizonte artificial, velocidade, altitude e heading.",
      shape: "rect",
      x: 20,
      y: 16,
      w: 12,
      h: 30,
      zoom_image_url: "/panels/montaer-analog-g5.png",
    },
    2,
  ),
  inst(
    {
      id: "analog-alt",
      name: "Altímetro",
      description: "Altímetro analógico com ajuste de QNH/QFE.",
      shape: "circle",
      x: 33,
      y: 14,
      w: 10,
      h: 26,
      zoom_image_url: "/panels/montaer-analog-alt.png",
    },
    3,
  ),
  inst(
    {
      id: "analog-vsi",
      name: "Variômetro (VSI)",
      description: "Indicador de velocidade vertical (subida/descida).",
      shape: "circle",
      x: 33,
      y: 42,
      w: 10,
      h: 24,
      zoom_image_url: null,
    },
    4,
  ),
  inst(
    {
      id: "analog-map",
      name: "Display de navegação",
      description: "Tela central com carta aeronáutica / GPS em rota.",
      shape: "rect",
      x: 45,
      y: 12,
      w: 22,
      h: 38,
      zoom_image_url: "/panels/montaer-analog-map.png",
    },
    5,
  ),
  inst(
    {
      id: "analog-radio",
      name: "Rádio / Transponder",
      description: "Stack de rádio COM/NAV e transponder abaixo do display central.",
      shape: "rect",
      x: 45,
      y: 52,
      w: 22,
      h: 18,
      zoom_image_url: "/panels/montaer-analog-radio.png",
    },
    6,
  ),
  inst(
    {
      id: "analog-engine",
      name: "Instrumentos do motor",
      description:
        "Cluster de gauges Rotax: RPM, óleo, temperaturas, combustível, voltímetro e hobbs.",
      shape: "rect",
      x: 70,
      y: 12,
      w: 26,
      h: 55,
      zoom_image_url: "/panels/montaer-analog-engine.png",
    },
    7,
  ),
  inst(
    {
      id: "analog-switches",
      name: "Switches elétricos",
      description:
        "Painel de rockers: AVIONICOS, AUX, BOMBA, ESTROBO, NAV, POUSO, BEACON, PAINEL, EFIS.",
      shape: "rect",
      x: 42,
      y: 78,
      w: 40,
      h: 14,
      zoom_image_url: "/panels/montaer-analog-switches.png",
    },
    8,
  ),
  inst(
    {
      id: "analog-magnetos",
      name: "Magnetos",
      description: "Interruptores de magnetos A/B com proteção vermelha.",
      shape: "rect",
      x: 10,
      y: 72,
      w: 14,
      h: 16,
      zoom_image_url: null,
    },
    9,
  ),
];

export const PANEL_SEED_TEMPLATES: PanelSeedTemplate[] = [
  {
    id: "montaer-glass",
    title: "Painel Glass (G3X + Tablet)",
    panel_image_url: "/panels/montaer-glass-panel.png",
    instruments: GLASS_INSTRUMENTS,
  },
  {
    id: "montaer-analog",
    title: "Painel Analógico (ASI + G5 + Motor)",
    panel_image_url: "/panels/montaer-analog-panel.png",
    instruments: ANALOG_INSTRUMENTS,
  },
];
