export type RewardIconCategory =
  | "voo"
  | "solo"
  | "noite"
  | "ifr"
  | "navegacao"
  | "pouso"
  | "decolagem"
  | "horas"
  | "sequencia"
  | "distancia"
  | "missao"
  | "etapa"
  | "excelencia";

export type RewardIconDefinition = {
  id: string;
  label: string;
  category: RewardIconCategory;
};

export const REWARD_ICONS: RewardIconDefinition[] = [
  { id: "flight", label: "Voo", category: "voo" },
  { id: "solo", label: "Solo", category: "solo" },
  { id: "moon", label: "Noturno", category: "noite" },
  { id: "instruments", label: "IFR", category: "ifr" },
  { id: "compass", label: "Navegação", category: "navegacao" },
  { id: "landing", label: "Pouso", category: "pouso" },
  { id: "takeoff", label: "Decolagem", category: "decolagem" },
  { id: "clock", label: "Horas", category: "horas" },
  { id: "streak", label: "Sequência", category: "sequencia" },
  { id: "route", label: "Distância", category: "distancia" },
  { id: "mission", label: "Missão", category: "missao" },
  { id: "stage", label: "Etapa", category: "etapa" },
  { id: "star", label: "Excelência", category: "excelencia" },
];

export function rewardIconExists(iconId: string | null | undefined): boolean {
  return Boolean(iconId && REWARD_ICONS.some((icon) => icon.id === iconId));
}

export const DEFAULT_REWARD_ICON_ID = "star";
