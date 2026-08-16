import type { FplHelpEntry } from "../types/fplSim";

const HELP: Record<string, FplHelpEntry> = {
  kind: {
    id: "kind",
    title: "PVS ou PVC",
    mcaRef: "MCA 100-11 itens 2.1 e 3.1",
    body: "O Plano de Voo Completo (PVC) preenche os itens 7 a 19 (MCA 100-11, 2.1.1). O Plano de Voo Simplificado (PVS) preenche os campos da frente do formulário do Anexo B, com a mesma lógica do item 2.2 no que for aplicável (MCA 100-11, 3.1 e 3.2).\n\nNa prática do DECEA (ICA 100-11), o PVS destina-se a voo VFR que permanece na ATZ, CTR, TMA, FIZ ou num raio de 50 km (27 NM) do aeródromo de partida. Fora disso, ou em IFR, use PVC.",
  },
  aircraftId: {
    id: "aircraftId",
    title: "Campo 7 — Identificação da aeronave",
    mcaRef: "MCA 100-11 2.2.1",
    body: "Inserir até 7 caracteres alfanuméricos, sem hífen nem símbolos: designador OACI da empresa + número do voo (ex.: GLO1866); ou marca de nacionalidade/comum + matrícula (ex.: PTABA); ou outro designador oficial.\n\nSe o indicativo de chamada em radiotelefonia ultrapassar 7 caracteres, coloque a matrícula neste item e o indicativo em RMK/ no Campo 18.",
  },
  callsign: {
    id: "callsign",
    title: "Indicativo de chamada",
    mcaRef: "MCA 100-11 2.2.1 NOTA e 2.2.8.1.21 f",
    body: "Campo expansivo. Ative só se o indicativo de radiotelefonia tiver mais de 7 caracteres. A matrícula fica no Campo 7 e o indicativo vai em RMK/INDICATIVO DE CHAMADA … no Campo 18.",
  },
  flightRules: {
    id: "flightRules",
    title: "Campo 8 — Regras de voo",
    mcaRef: "MCA 100-11 2.2.2.1",
    body: "I = voo totalmente IFR; V = totalmente VFR; Y = inicia IFR e depois muda; Z = inicia VFR e depois muda.\n\nCom Y ou Z, indique no Campo 15 os pontos de mudança de regra (2.2.6.3.5). PVS é, em regra, VFR (V).",
  },
  flightType: {
    id: "flightType",
    title: "Campo 8 — Tipo de voo",
    mcaRef: "MCA 100-11 2.2.2.2",
    body: "S = transporte regular; N = não regular; G = aviação geral; M = militar; X = distinto dos anteriores. Instrução em aeroclube/escola entra em G.",
  },
  number: {
    id: "number",
    title: "Campo 9 — Número de aeronaves",
    mcaRef: "MCA 100-11 2.2.3.1",
    body: "Campo oculto na prática do dia a dia: preencha só em voo em formação (1 ou 2 dígitos). Deixe em branco para uma aeronave só.",
  },
  aircraftType: {
    id: "aircraftType",
    title: "Campo 9 — Tipo de aeronave",
    mcaRef: "MCA 100-11 2.2.3.2",
    body: "Designador OACI Doc 8643, de 2 a 4 caracteres (ex.: C152, P28A). Use ZZZZ se não houver designador, em formação com tipos diferentes ou tipo militar específico — e detalhe TYP/ no Campo 18.",
  },
  wake: {
    id: "wake",
    title: "Campo 9 — Esteira de turbulência",
    mcaRef: "MCA 100-11 2.2.3.3",
    body: "L = leve (Peso Máx. Decolagem ≤ 7.000 kg); M = média (> 7.000 e < 136.000 kg); H = pesada (≥ 136.000 kg, exceto SUPER); J = SUPER, conforme Doc 8643.",
  },
  eq10a: {
    id: "eq10a",
    title: "Campo 10 A — COM/NAV/aproximação",
    mcaRef: "MCA 100-11 2.2.4.2",
    body: "N = sem equipamento exigido para a rota (exclui os demais). S = equipamentos padronizados (VHF RTF, VOR e ILS, salvo combinação diferente da autoridade ATS).\n\nComplemente com as letras necessárias (G = GNSS, D = DME, R = PBN, Z = outro, etc.). R exige PBN/ no Campo 18. Z exige COM/, NAV/ e/ou DAT/. G pode exigir NAV/ para aumentação GNSS.",
  },
  eq10b: {
    id: "eq10b",
    title: "Campo 10 B — Vigilância",
    mcaRef: "MCA 100-11 2.2.4.3",
    body: "N = sem vigilância. SSR A/C: A = Modo A; C = Modo A+C (não use os dois). Modo S: escolha um código (E, H, I, L, P, S ou X). ADS-B (B1/B2/U1/U2/V1/V2) e ADS-C (D1/G1) podem complementar. Máximo 20 caracteres.",
  },
  depAd: {
    id: "depAd",
    title: "Campo 13 — Aeródromo de partida",
    mcaRef: "MCA 100-11 2.2.5.1",
    body: "Indicador de 4 caracteres (ex.: SBJD). Sem indicador OACI, use ZZZZ e descreva DEP/ no Campo 18 (coordenadas DDMMN/SDDDMME/W ou município + UF + localidade).",
  },
  depTime: {
    id: "depTime",
    title: "Campo 13 — Hora",
    mcaRef: "MCA 100-11 2.2.5.2 e 1.4.2",
    body: "EOBT em UTC, 4 algarismos (HHMM). No AFIL, use a hora real de decolagem. Durações e horas sempre em UTC.",
  },
  destAd: {
    id: "destAd",
    title: "Campo 16 — Destino",
    mcaRef: "MCA 100-11 2.2.7.1",
    body: "Indicador de 4 caracteres. Sem indicador, ZZZZ + DEST/ no Campo 18.",
  },
  eet: {
    id: "eet",
    title: "Campo 16 — EET total",
    mcaRef: "MCA 100-11 2.2.7.1 e 1.4.2 d",
    body: "Duração total prevista com 4 algarismos (horas e minutos). Em AFIL, conta a partir do primeiro ponto da rota do plano.",
  },
  altn: {
    id: "altn",
    title: "Campo 16 — Alternativo",
    mcaRef: "MCA 100-11 2.2.7.2",
    body: "Até dois aeródromos de alternativa (4 caracteres cada) ou em branco conforme ANAC. Sem indicador, ZZZZ + ALTN/ no Campo 18.",
  },
  altn2: {
    id: "altn2",
    title: "Campo 16 — 2º alternativo",
    mcaRef: "MCA 100-11 2.2.7.2",
    body: "Opcional. Segundo aeródromo de alternativa de destino.",
  },
  cruiseSpeed: {
    id: "cruiseSpeed",
    title: "Campo 15 — Velocidade de cruzeiro",
    mcaRef: "MCA 100-11 2.2.6.1",
    body: "Máximo 5 caracteres: K + 4 dígitos (km/h), N + 4 dígitos (nós) ou M + 3 dígitos (Mach, centésimos). Ex.: N0090, K0650, M082.",
  },
  level: {
    id: "level",
    title: "Campo 15 — Nível",
    mcaRef: "MCA 100-11 2.2.6.2",
    body: "Máximo 4 caracteres, conforme ICA 100-12 (rumo magnético e regra de voo). F + 3 dígitos (nível de voo), A + 3 dígitos (altitude em centenas de pés), VFR, S + 4 dígitos (metros padrão) ou M + 4 dígitos (metros). Ex.: F080, A035, VFR.",
  },
  route: {
    id: "route",
    title: "Campo 15 — Rota",
    mcaRef: "MCA 100-11 2.2.6.3",
    body: "Campo expansivo. Em rota ATS: designador da rota ou DCT + ponto de junção. Fora de ATS: DCT entre pontos significativos. Pontos: 2–5 letras, ou coordenadas (ex.: 2306S04634W).\n\nMudança de velocidade/nível: ponto + barra + nova velocidade e nível. Y/Z: indique o ponto de mudança de regra.",
  },
  dof: {
    id: "dof",
    title: "Campo 18 — DOF/",
    mcaRef: "MCA 100-11 2.2.8.1.9",
    body: "Data de partida YYMMDD se o voo não for no dia da apresentação. Ex.: 260815 = 15/08/2026.",
  },
  item18: {
    id: "item18",
    title: "Campo 18 — Outras informações",
    mcaRef: "MCA 100-11 2.2.8.1",
    body: "Campo expansivo: o “+” abre a lista de indicadores. Use só os da MCA, na ordem STS/, PBN/, NAV/, COM/, DAT/, SUR/, DEP/, DEST/, … RMK/. Indicadores inventados podem rejeitar o plano. FROM, quando usado, deve ser o último dado.",
  },
  STS: {
    id: "STS",
    title: "STS/",
    mcaRef: "MCA 100-11 2.2.8.1.1",
    body: "Tratamento especial ATS: ALTRV, ATFMX, FFR, FLTCK, HAZMAT, HEAD, HOSP, HUM, MARSA, MEDEVAC, NONRVSM, SAR, STATE. Outros motivos vão em RMK/. HAZMAT+radiofármaco: RMK/RADIOFARMACO. HUM: RMK/SEGP ou DEFC. MEDEVAC: RMK/TREN ou TROV.",
  },
  PBN: {
    id: "PBN",
    title: "PBN/",
    mcaRef: "MCA 100-11 2.2.8.1.2 e 2.2.4.2.6",
    body: "Obrigatório se R estiver no Campo 10 A. Até 8 designadores (16 caracteres): A1, B1–B6, C1–C4, D1–D4, L1, O1–O4, S1, S2, T1, T2. Ex.: B2C2D2S1.",
  },
  NAV: {
    id: "NAV",
    title: "NAV/",
    mcaRef: "MCA 100-11 2.2.8.1.3",
    body: "Equipamento extra de navegação se Z no Campo 10, e/ou aumentação GNSS se G (ex.: NAV/GBAS).",
  },
  COM: {
    id: "COM",
    title: "COM/",
    mcaRef: "MCA 100-11 2.2.8.1.4",
    body: "Equipamentos/capacidades de comunicações se Z no Campo 10. Ex.: COM/UHF ONLY.",
  },
  DAT: {
    id: "DAT",
    title: "DAT/",
    mcaRef: "MCA 100-11 2.2.8.1.5",
    body: "Capacidades de dados não especificadas no Campo 10.",
  },
  SUR: {
    id: "SUR",
    title: "SUR/",
    mcaRef: "MCA 100-11 2.2.4.4 e 2.2.8.1.6",
    body: "Vigilância extra e especificações RSP, sem espaço entre o indicador e o valor; vários RSP separados por espaço. Ex.: SUR/RSP180 RSP400.",
  },
  DEP: {
    id: "DEP",
    title: "DEP/",
    mcaRef: "MCA 100-11 2.2.8.1.7",
    body: "Obrigatório se Campo 13 = ZZZZ. Coordenadas (11 caracteres, ex.: 2306S04634W) ou município UF localidade.",
  },
  DEST: {
    id: "DEST",
    title: "DEST/",
    mcaRef: "MCA 100-11 2.2.8.1.8",
    body: "Obrigatório se destino = ZZZZ. Mesmo formato de DEP/.",
  },
  REG: {
    id: "REG",
    title: "REG/",
    mcaRef: "MCA 100-11 2.2.8.1.10",
    body: "Matrícula se diferente do Campo 7, ou matrículas da formação separadas por espaço.",
  },
  EET: {
    id: "EET",
    title: "EET/",
    mcaRef: "MCA 100-11 2.2.8.1.11",
    body: "Pontos significativos ou limites de FIR + EET desde a decolagem. Ex.: EET/SBAZ0045 SBBS0110.",
  },
  SEL: {
    id: "SEL",
    title: "SEL/",
    mcaRef: "MCA 100-11 2.2.8.1.12",
    body: "Código SELCAL, 4 letras. Ex.: SEL/FKLM.",
  },
  TYP: {
    id: "TYP",
    title: "TYP/",
    mcaRef: "MCA 100-11 2.2.8.1.13",
    body: "Obrigatório se Campo 9 = ZZZZ. Tipo(s) de aeronave; em formação, número + tipo. Ex.: TYP/EMB123 ou TYP/2C130 2C95C.",
  },
  CODE: {
    id: "CODE",
    title: "CODE/",
    mcaRef: "MCA 100-11 / OACI Doc 4444",
    body: "Endereço de aeronave (24 bits) em hexadecimal, quando exigido.",
  },
  DLE: {
    id: "DLE",
    title: "DLE/",
    mcaRef: "MCA 100-11 2.2.8.1.14",
    body: "Atraso/espera em rota: ponto + 4 dígitos hhmm. Ex.: DLE/RDE0030.",
  },
  OPR: {
    id: "OPR",
    title: "OPR/",
    mcaRef: "MCA 100-11 2.2.8.1.15",
    body: "Explorador (civil) ou sigla da Unidade Aérea (militar), se não estiver claro no Campo 7.",
  },
  ORGN: {
    id: "ORGN",
    title: "ORGN/",
    mcaRef: "MCA 100-11 1.3",
    body: "Originador da mensagem (órgão/endereço AFTN). No FPL-BR costuma vir preenchido pelo sistema.",
  },
  PER: {
    id: "PER",
    title: "PER/",
    mcaRef: "MCA 100-11 2.2.8.1.16",
    body: "Categoria de performance pela Vat no peso máx. de pouso: A < 91 kt; B 91–120; C 121–140; D 141–165; E 166–210; H = helicóptero.",
  },
  ALTN: {
    id: "ALTN",
    title: "ALTN/",
    mcaRef: "MCA 100-11 2.2.8.1.17",
    body: "Obrigatório se alternativo = ZZZZ. Coordenadas ou município UF localidade.",
  },
  RALT: {
    id: "RALT",
    title: "RALT/",
    mcaRef: "MCA 100-11 2.2.8.1.18",
    body: "Alternativa em rota (4 letras ou nome). Com Y/Z e destino só VFR, indique nível IFR, rota e alternativa IFR.",
  },
  TALT: {
    id: "TALT",
    title: "TALT/",
    mcaRef: "MCA 100-11 2.2.8.1.19",
    body: "Alternativa pós-decolagem. Use quando o destino de partida estiver no mínimo ou abaixo, ou se não for possível regressar.",
  },
  RIF: {
    id: "RIF",
    title: "RIF/",
    mcaRef: "MCA 100-11 2.2.8.1.20",
    body: "Rota revisada até novo destino + indicador de 4 letras. Sujeita a nova autorização em voo.",
  },
  RMK: {
    id: "RMK",
    title: "RMK/",
    mcaRef: "MCA 100-11 2.2.8.1.21",
    body: "Observações na ordem da MCA: TREN/TROV, SEGP/DEFC, SLOT, AVO, AD CFM, indicativo longo, autoridades, AFIL, FROM (sempre por último se usado), NONRNAV5, DEP CFM, experimental (CUMPRE RBAC 91319), COOR AR AR PORT, GEDEC CFM, DAT, ou texto claro. No PVS, pode complementar o Campo 15 (ex.: RMK/500FT AGL).",
  },
  FROM: {
    id: "FROM",
    title: "FROM/",
    mcaRef: "MCA 100-11 2.2.8.1.21 i",
    body: "Aeródromo da última decolagem. Não se aplica a militares brasileiras nem regular. Deve ser o último dado do Campo 18.",
  },
  endurance: {
    id: "endurance",
    title: "Campo 19 — Autonomia",
    mcaRef: "MCA 100-11 2.2.9.2",
    body: "4 algarismos, horas e minutos de combustível. O Item 19 não vai na mensagem FPL, mas fica disponível no aeródromo de partida.",
  },
  personsOnBoard: {
    id: "personsOnBoard",
    title: "Campo 19 — Pessoas a bordo",
    mcaRef: "MCA 100-11 2.2.9.3",
    body: "Total de pessoas (tripulação + passageiros) ou TBN se ainda desconhecido — nesse caso informe por rádio até a decolagem.",
  },
  emergencyRadio: {
    id: "emergencyRadio",
    title: "Campo 19 — Rádio de emergência",
    mcaRef: "MCA 100-11 2.2.9.4 R/",
    body: "U = UHF 243,0 MHz; V = VHF 121,5 MHz; E = ELT. Marque só o que existir a bordo.",
  },
  survival: {
    id: "survival",
    title: "Campo 19 — Sobrevivência",
    mcaRef: "MCA 100-11 2.2.9.4 S/",
    body: "S = equipamento de sobrevivência. Complemente: P polar, D deserto, M marítimo, J selva. Campos expansivos: só detalhe o que a aeronave realmente leva.",
  },
  jackets: {
    id: "jackets",
    title: "Campo 19 — Coletes",
    mcaRef: "MCA 100-11 2.2.9.4 J/",
    body: "J = coletes a bordo. L = luz; F = fluorescência; U/V = rádio do colete. Se não houver coletes, deixe tudo desligado.",
  },
  dinghies: {
    id: "dinghies",
    title: "Campo 19 — Botes",
    mcaRef: "MCA 100-11 2.2.9.4 D/",
    body: "Campo expansivo: ligue D se houver botes. Aí aparecem número, capacidade total de pessoas, C (abrigo) e cor.",
  },
  aircraftColor: {
    id: "aircraftColor",
    title: "Campo 19 — Cor e marca da ANV",
    mcaRef: "MCA 100-11 2.2.9.4 A/",
    body: "Cor e marcas da aeronave em linguagem clara. Ex.: AMARELO E BRANCO.",
  },
  picName: {
    id: "picName",
    title: "Campo 19 — Piloto em comando",
    mcaRef: "MCA 100-11 2.2.9.4 C/",
    body: "Nome do piloto em comando. No AFIL, nome e código ANAC do PIC, POB e autonomia não podem ser omitidos.",
  },
  anac1: {
    id: "anac1",
    title: "Cód. ANAC 1º piloto",
    mcaRef: "MCA 100-11 2.2.9.1",
    body: "Código ANAC do piloto em comando. Obrigatório no FPL-BR e no AFIL.",
  },
  anac2: {
    id: "anac2",
    title: "Cód. ANAC 2º piloto",
    mcaRef: "MCA 100-11 2.2.9",
    body: "Opcional. Código ANAC do segundo piloto, se houver.",
  },
  phone: {
    id: "phone",
    title: "Telefone",
    mcaRef: "MCA 100-11 2.2.9",
    body: "Telefone de contato do PIC / explorador, usado pelo ATS/SAR se precisar das informações do Item 19.",
  },
};

export function getFplHelp(fieldId: string): FplHelpEntry {
  return (
    HELP[fieldId] ?? {
      id: fieldId,
      title: fieldId,
      mcaRef: "MCA 100-11",
      body: "Consulte o MCA 100-11 para o preenchimento deste campo.",
    }
  );
}

export function fplHelpIds(): string[] {
  return Object.keys(HELP);
}
