import { Client, Databases, ID, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const SECTIONS_COL_ID = process.env.APPWRITE_MANEUVERS_SECTIONS_COL_ID || process.env.VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID;
const ARTICLES_COL_ID = process.env.APPWRITE_MANEUVERS_ARTICLES_COL_ID || process.env.VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !SECTIONS_COL_ID || !ARTICLES_COL_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID, VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const MANEUVERS = [
  {
    order: 1,
    title: "Checagem da Documentação, Equipamentos e Itens Obrigatórios a Bordo",
    pages: [9, 11],
    summary: "Conferência documental e dos itens obrigatórios antes de qualquer voo.",
    tags: ["documentacao", "pre-voo", "seguranca"],
    blocks: [
      ["heading", "Objetivo"],
      ["paragraph", "Antes do início de qualquer voo, é fundamental realizar a conferência dos documentos obrigatórios da aeronave, dos registros operacionais, dos equipamentos e dos materiais de voo exigidos."],
      ["paragraph", "Essa verificação garante que cartas aeronáuticas atualizadas, kit de primeiros socorros, extintores, coletes, lanternas quando aplicável e demais recursos previstos estejam devidamente embarcados."],
      ["heading", "Documentos de porte obrigatório"],
      ["bullet", ["Apólice de seguro.", "Certificado de aeronavegabilidade.", "Certificado de matrícula.", "Certificado de verificação de aeronavegabilidade (CVA).", "Diário de bordo.", "Ficha de peso e balanceamento.", "Licença de estação.", "Lista de verificações (checklist).", "Manifesto de carga preenchido.", "Manual original da aeronave."]],
    ],
  },
  {
    order: 2,
    title: "Descrição das Manobras",
    pages: [13, 23],
    summary: "Padronização inicial: check pré-voo, check externo, partida, taxi e briefing de decolagem.",
    tags: ["procedimentos", "check", "taxi"],
    blocks: [
      ["paragraph", "As manobras e padrões apresentados refletem métodos padronizados adotados pela EPEAC para a operação. O piloto em instrução deve interpretar cada cenário e ajustar velocidade, atitude e ações às condições presentes."],
      ["heading", "Check pré-voo e check externo"],
      ["paragraph", "O check pré-voo deve ser conduzido com calma e com o checklist oficial da aeronave em mãos. O check externo busca garantir a segurança do voo e preservar a aeronave por meio de uma inspeção criteriosa antes da partida."],
      ["heading", "Partida e aquecimento do motor"],
      ["bullet", ["Freios totalmente aplicados antes do acionamento.", "Mão direita na manete de potência, pronta para corte se necessário.", "Acionamento do motor limitado a 10 segundos contínuos.", "Aguardar ao menos 20 segundos entre tentativas.", "Monitorar pressão e temperatura de óleo imediatamente após a partida.", "Desligar o motor se não houver indicação de pressão de óleo em até 30 segundos."]],
      ["heading", "Taxi"],
      ["paragraph", "O taxiamento exige consciência situacional, familiarização com o aeródromo, uso de diagramas e cartas, velocidade segura e controle suave para evitar desgaste de freios, danos ao trem de pouso ou perda de controle."],
      ["heading", "Sequência de taxi"],
      ["ordered", ["Solicitar autorização.", "Checar área.", "Aplicar potência gradualmente para sair da inércia e reduzir.", "Iniciar a rolagem mantendo controle direcional com pedais.", "Manter a mão na manete para pequenos ajustes.", "Manter a center line.", "Utilizar os freios suavemente."]],
      ["heading", "Briefing e cheque pré-decolagem"],
      ["paragraph", "No briefing, o aluno deve verbalizar tipo de decolagem, cabeceira, configuração de flap, velocidade de rotação, velocidade de subida, saída prevista e ações em caso de pane. No ponto de espera, o cheque pré-decolagem confirma motor, instrumentos e área livre."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não checar a área antes de iniciar o taxi.", "Aplicar potência excessiva para iniciar o taxi.", "Usar pedais ou freios bruscamente.", "Não manter a center line.", "Não checar os freios.", "Tentar taxiar a aeronave pelo manche."]],
    ],
  },
  {
    order: 3,
    title: "Decolagem",
    pages: [25, 36],
    summary: "Decolagem normal, curta, rejeição, saída do circuito e voo ascendente.",
    tags: ["decolagem", "subida", "rejeicao"],
    blocks: [
      ["paragraph", "Durante a corrida de decolagem, o piloto deve manter atenção redobrada ao alinhamento com o eixo da pista, corrigindo desvios com comandos suaves de leme e mantendo a coordenação com o briefing planejado."],
      ["heading", "Decolagem normal"],
      ["ordered", ["Alinhar utilizando toda a extensão disponível da pista.", "Aplicar potência total gradualmente.", "Manter a aeronave alinhada ao eixo da pista.", "Iniciar rotação suavemente ao atingir a velocidade prevista.", "Estabilizar a subida e realizar o checklist pós-decolagem ao atingir a altura definida."]],
      ["heading", "Decolagem curta"],
      ["paragraph", "A decolagem curta busca retirar a aeronave do solo no menor espaço possível, especialmente quando há obstáculos próximos ao final da pista. O procedimento exige configuração adequada de flap, potência total com freios aplicados, rotação controlada e subida em melhor ângulo até livrar obstáculos."],
      ["heading", "Rejeição de decolagem"],
      ["paragraph", "Em caso de falha, dúvida sobre continuidade, aceleração anormal, incursão de pista ou orientação ATC, deve-se verbalizar REJECTING, reduzir potência totalmente, aplicar freios de forma suave e progressiva e comunicar o ATC somente após controlar a aeronave."],
      ["heading", "Voo ascendente"],
      ["paragraph", "O voo ascendente eleva a aeronave a novo nível de altitude, mantendo controle preciso de atitude, velocidade, proa e asas niveladas. A velocidade é controlada pela atitude, enquanto a potência permanece no regime de subida."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não manter a aeronave alinhada na corrida.", "Iniciar rotação antes da velocidade correta.", "Não compensar vento de través.", "Aplicar comandos excessivos nos pedais.", "Não manter velocidade de subida constante.", "Demorar a aplicar potência ou ajustar compensador incorretamente."]],
    ],
  },
  {
    order: 4,
    title: "Voo em Linha Reta Horizontal",
    pages: [38, 42],
    summary: "Manutenção de proa, altitude e velocidade em voo reto e nivelado.",
    tags: ["voo nivelado", "vlrh", "compensador"],
    blocks: [
      ["paragraph", "O voo reto e nivelado consiste na manutenção constante da proa, altitude e velocidade, utilizando referências visuais externas, comandos de voo, instrumentos e compensadores."],
      ["heading", "Princípios"],
      ["bullet", ["Tração controlada pela manete do motor.", "Atitude controlada pelo manche.", "Compensador usado para aliviar esforço e estabilizar a atitude.", "Referências visuais externas para manter proa e nivelamento.", "Instrumentos usados para confirmar e corrigir desvios."]],
      ["heading", "Procedimento"],
      ["ordered", ["Checar a área.", "Selecionar referência visual fixa à frente.", "Ajustar a atitude para manter velocidade desejada.", "Ajustar potência de cruzeiro.", "Observar pontas das asas em relação ao horizonte.", "Usar compensador após estabilizar.", "Verificar instrumentos para confirmar estabilidade."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Usar referência próxima ou móvel.", "Corrigir atitude apenas por instrumentos.", "Manter tensão excessiva nos comandos.", "Usar compensador como controle de atitude.", "Variar altitude por falta de atitude constante.", "Não escanear o ambiente externo."]],
    ],
  },
  {
    order: 5,
    title: "Voo Descendente",
    pages: [44, 48],
    summary: "Perda controlada de altitude mantendo proa, asas niveladas e razão de descida.",
    tags: ["descida", "planeio", "altitude"],
    blocks: [
      ["paragraph", "O voo descendente é uma perda controlada de altitude, mantendo proa, asas niveladas e razão de descida constante. Exige controle preciso de atitude, potência e compensação."],
      ["heading", "Sequência"],
      ["ordered", ["Checar a área.", "Escolher referência visual na proa.", "Reduzir potência gradualmente.", "Picar suavemente o nariz.", "Manter asas niveladas.", "Ajustar compensador.", "Estabilizar razão de descida entre 300 e 500 ft/min, conforme necessário."]],
      ["heading", "Tipos"],
      ["bullet", ["Voo descendente padrão.", "Voo descendente em rota.", "Descida em velocidade mínima segura.", "Descida de emergência."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Iniciar atitude de descida antes de reduzir potência quando inadequado.", "Não checar área.", "Variar proa.", "Não manter razão constante.", "Nivelar tarde ou cedo demais.", "Corrigir com comandos bruscos."]],
    ],
  },
  {
    order: 6,
    title: "Mudanças de Atitude",
    pages: [50, 54],
    summary: "Transições coordenadas entre voo nivelado, ascendente e descendente.",
    tags: ["atitude", "transicao", "trim"],
    blocks: [
      ["paragraph", "A transição entre atitudes deve ser coordenada, suave e lógica. A sequência geral é atitude da aeronave, potência e compensador, exceto na transição do voo nivelado para descendente, quando a potência é reduzida primeiro."],
      ["heading", "Sequências principais"],
      ["bullet", ["Voo nivelado para ascendente: cabrar suavemente, ajustar potência de subida e compensar.", "Ascendente para nivelado: picar para atitude de cruzeiro, manter potência até acelerar, ajustar RPM de cruzeiro e compensar.", "Nivelado para descendente: reduzir potência, picar levemente e compensar.", "Descendente para nivelado: cabrar para zerar razão de descida, ajustar potência e compensar."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Comandos abruptos.", "Variação de proa por falta de referência.", "Alterar potência antes da atitude quando não aplicável.", "Não estabilizar atitude antes do próximo passo.", "Compensar incorretamente."]],
    ],
  },
  {
    order: 7,
    title: "Curvas",
    pages: [56, 62],
    summary: "Mudança coordenada de proa mantendo altitude e controle de inclinação.",
    tags: ["curvas", "coordenacao", "bank"],
    blocks: [
      ["paragraph", "A curva tem por finalidade realizar mudança de proa de forma coordenada, mantendo altitude constante e usando referências visuais no solo e no horizonte."],
      ["heading", "Classificação"],
      ["bullet", ["Pequena inclinação: aproximadamente 15 graus.", "Média inclinação: aproximadamente 30 graus.", "Grande inclinação: aproximadamente 45 graus."]],
      ["heading", "Sequência"],
      ["ordered", ["Checar área em voz alta.", "Escolher referência no solo.", "Iniciar curva com aileron e pedal para o lado desejado.", "Monitorar nariz no horizonte, velocidade, altitude e coordenação.", "Antecipar a saída e retornar ao voo nivelado."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Não checar área.", "Não manter inclinação adequada.", "Ganhar ou perder altitude.", "Perder referência visual.", "Curva descoordenada.", "Não ajustar potência em curvas médias ou acentuadas quando necessário."]],
    ],
  },
  {
    order: 8,
    title: "Voo Planado",
    pages: [64, 68],
    summary: "Descida sem potência com controle da velocidade de melhor planeio.",
    tags: ["planado", "emergencia", "flap"],
    blocks: [
      ["paragraph", "O voo planado é uma descida sem uso de potência, buscando a maior distância horizontal possível a partir de uma altitude. Desenvolve controle de atitude em condição de motor reduzido e simula falhas ou aproximações de precisão."],
      ["heading", "Sequência"],
      ["ordered", ["Checar área.", "Escolher referência visual na proa.", "Reduzir potência suavemente.", "Ajustar atitude para velocidade de melhor planeio.", "Compensar a aeronave.", "Executar voo planado em linha reta e curvas suaves.", "Observar o impacto de diferentes configurações de flap."]],
      ["heading", "Flaps"],
      ["paragraph", "Maior deflexão de flap aumenta o ângulo de descida, reduz a distância horizontal e melhora a visibilidade da pista, mas reduz alcance."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não manter velocidade ideal.", "Falta de compensação.", "Variar proa.", "Recolher flaps em curva.", "Durante arremetida, recolher flaps abruptamente."]],
    ],
  },
  {
    order: 9,
    title: "Voo em Retângulo",
    pages: [70, 75],
    summary: "Treino de circuito de tráfego, trajetória retangular e correções de deriva.",
    tags: ["retangulo", "circuito", "vento"],
    blocks: [
      ["paragraph", "O voo em retângulo habitua o piloto ao circuito de tráfego padrão, treinando controle de trajetória em relação a uma referência no solo, altitude constante e correções de deriva em função do vento."],
      ["heading", "Sequência"],
      ["ordered", ["Checar área.", "Escolher uma referência retangular no solo, preferencialmente uma pista.", "Manter voo reto e nivelado paralelo à referência.", "Realizar curvas coordenadas de 90 graus ao final de cada perna.", "Identificar direção do vento e aplicar correções de deriva.", "Identificar cada perna do retângulo conforme o vento atuante."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Não checar área.", "Variar altitude.", "Voar muito próximo ou afastado da referência.", "Não corrigir deriva.", "Curvas descoordenadas."]],
    ],
  },
  {
    order: 10,
    title: "S Sobre Estradas",
    pages: [77, 81],
    summary: "Curvas alternadas de 180 graus sobre uma referência linear no solo.",
    tags: ["s sobre estradas", "vento", "solo"],
    blocks: [
      ["paragraph", "A manobra S sobre estradas consiste em curvas alternadas de 180 graus feitas sobre uma linha reta no solo, formando um traçado em S. O objetivo é apurar percepção de distância lateral, controle sob efeito do vento e coordenação."],
      ["heading", "Sequência"],
      ["ordered", ["Checar área antes de cada curva.", "Escolher trecho reto de estrada, rodovia ou ferrovia.", "Manter 1000 pés AGL.", "Iniciar perpendicular à referência com asas niveladas.", "Após cruzar a referência pela cauda, iniciar curva coordenada de 180 graus.", "Ajustar inclinação conforme o vento.", "Terminar cruzando novamente a estrada perpendicularmente.", "Repetir para o lado oposto mantendo simetria."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Iniciar curva antes da cauda cruzar a estrada.", "Cruzar sem asas niveladas.", "Não ajustar inclinação pelo vento.", "Variar altitude.", "Não aplicar correção de potência em curvas de grande inclinação."]],
    ],
  },
  {
    order: 11,
    title: "8 ao Redor de Marcos",
    pages: [83, 87],
    summary: "Curvas coordenadas em torno de dois marcos no solo com correção de vento.",
    tags: ["8 ao redor", "marcos", "vento"],
    blocks: [
      ["paragraph", "A manobra 8 ao redor de marcos desenvolve habilidade de manter curvas coordenadas com raio constante, compensando vento e aprimorando percepção espacial e de distância em relação a referências no solo."],
      ["heading", "Sequência"],
      ["ordered", ["Checar área.", "Escolher dois marcos visíveis separados aproximadamente por 1500 metros.", "Manter altura de 1000 pés ou conforme instrução local.", "Iniciar no ponto médio entre os marcos.", "Curvar ao redor do primeiro marco ajustando inclinação pelo vento.", "Transicionar para o segundo marco mantendo raio constante.", "Usar pontos auxiliares para formar um pontilhado imaginário.", "Adicionar cerca de 100 RPM nas curvas de maior inclinação quando necessário."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Não manter altitude.", "Não manter raio constante.", "Não compensar vento.", "Cruzar eixos com asas desniveladas.", "Não aplicar potência adicional em curvas de maior inclinação.", "Escolher marcos inadequados."]],
    ],
  },
  {
    order: 12,
    title: "Coordenações",
    pages: [89, 103],
    summary: "Coordenação de comandos, estol, estol iminente e velocidade mínima de controle.",
    tags: ["coordenacao", "estol", "vmc"],
    blocks: [
      ["paragraph", "Coordenações fazem o aluno dominar a relação entre manche e pedal, mantendo referência em relação ao nariz da aeronave, sem ganhar ou perder altura."],
      ["heading", "Coordenação de primeiro tipo"],
      ["paragraph", "Alterna a inclinação das asas de um lado para o outro, mantendo o nariz fixo em uma referência visual no horizonte e o voo nivelado."],
      ["heading", "Coordenação de segundo tipo"],
      ["paragraph", "Executa curvas coordenadas reversas, usando uma referência central e referências laterais, mantendo simetria, inclinação e altitude."],
      ["heading", "Estol"],
      ["paragraph", "O estol é perda de sustentação provocada por ângulo de ataque excessivo. O treinamento busca reconhecer sinais, prevenir a condição e recuperar a aeronave com segurança."],
      ["bullet", ["Estol com potência: simula condições de decolagem, subida íngreme ou arremetida.", "Estol sem potência: simula aproximação para pouso.", "Estol iminente: aproximação do ângulo crítico sem ultrapassá-lo.", "VMC: voo em baixa velocidade e alto ângulo de ataque para desenvolver controle próximo aos limites aerodinâmicos."]],
      ["heading", "Recuperação padrão do estol"],
      ["ordered", ["Reduzir imediatamente o ângulo de ataque.", "Aplicar potência suavemente e progressivamente.", "Nivelar asas e manter coordenação com leme.", "Atingida a velocidade de melhor planeio, estabelecer subida.", "Reconfigurar a aeronave conforme necessário."]],
      ["heading", "Erros comuns"],
      ["bullet", ["Não checar a área antes de iniciar as manobras.", "Variar atitude, proa ou altitude durante coordenações.", "Glissar ou derrapar por uso incorreto dos pedais.", "Recuperar o estol com movimentos bruscos.", "Manter atitude elevada por tempo excessivo.", "Deixar a aeronave entrar em estol durante VMC.", "Tentar controlar velocidade apenas com potência ou altitude apenas com manche."]],
    ],
  },
  {
    order: 13,
    title: "Glissadas",
    pages: [105, 110],
    summary: "Aumento de razão de descida sem aumento significativo de velocidade.",
    tags: ["glissada", "pouso", "descida"],
    blocks: [
      ["paragraph", "A glissada aumenta rapidamente a razão de descida sem incrementar a velocidade, útil em aproximações íngremes, pousos de precisão e emergências. É realizada em voo planado, cruzando comandos de aileron e leme."],
      ["heading", "Glissada frontal"],
      ["paragraph", "A aeronave é mantida alinhada com a referência no solo, mas o nariz aponta lateralmente pela aplicação cruzada dos comandos, descendo em linha reta com eixo longitudinal desalinhado da trajetória."],
      ["heading", "Glissada lateral"],
      ["paragraph", "O eixo longitudinal permanece paralelo à referência, enquanto a trajetória é inclinada em relação a esse eixo, permitindo deslizar lateralmente para corrigir alinhamento, especialmente com vento de través."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não coordenar aileron e leme.", "Usar arfagem para aumentar razão de descida.", "Deixar cair velocidade.", "Desfazer comandos cruzados bruscamente.", "Não aplicar pedal suficiente para contrabalancear a inclinação."]],
    ],
  },
  {
    order: 14,
    title: "Emergência Simulada Fora do Circuito de Tráfego",
    pages: [112, 118],
    summary: "Treinamento de pane de motor fora e dentro do circuito de tráfego.",
    tags: ["emergencia", "pane", "motor"],
    blocks: [
      ["paragraph", "A emergência simulada treina o aluno para lidar com situações reais em voo, especialmente pane de motor fora do circuito. O aluno deve seguir o checklist, manter melhor planeio e escolher local adequado para pouso."],
      ["heading", "Sequência inicial"],
      ["ordered", ["Manter velocidade de melhor planeio e compensar.", "Selecionar local adequado para pouso, preferencialmente contra o vento e com leve aclive.", "Imaginar circuito completo para aproximação e pouso.", "Tentar reacionamento acima de 1000 pés AGL.", "Se não houver sucesso, prosseguir ao local escolhido e iniciar checklist de corte."]],
      ["heading", "Atenção"],
      ["paragraph", "Durante emergência simulada, os procedimentos devem ser apenas verbalizados pelo aluno, sem execução real dos cortes e desligamentos."],
      ["heading", "No circuito de tráfego"],
      ["paragraph", "As emergências simuladas no circuito preparam para panes na decolagem, perna de través, perna do vento e outras fases, priorizando voo planado, circuito mais curto e garantia de chegada à pista."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não checar área.", "Não manter melhor planeio.", "Afastar-se do local escolhido.", "Não imaginar circuito adequado.", "Executar reacionamento ou corte de forma incompleta."]],
    ],
  },
  {
    order: 15,
    title: "Briefing de Aproximação e Pouso",
    pages: [120, 126],
    summary: "Briefing, circuito, aproximação final, flare, vento de través e check pós-pouso.",
    tags: ["briefing", "aproximacao", "pouso"],
    blocks: [
      ["paragraph", "Antes da descida para pouso, o piloto deve realizar briefing de aproximação e pouso considerando condições meteorológicas, frequências, cartas, cabeceiras, distâncias disponíveis e ameaças como tráfego, obstáculos e pássaros."],
      ["heading", "Circuito e check pré-pouso"],
      ["paragraph", "Ao passar o través da cabeceira em uso na perna do vento, deve-se realizar o check pré-pouso conforme checklist da aeronave e manter altitude padrão até preparar a descida para a base."],
      ["heading", "Aproximação final"],
      ["paragraph", "Na final, deve-se manter velocidade ideal para a configuração de flap, seguir rampa imaginária alinhada à cabeceira e controlar velocidade pela atitude e altura da rampa pela potência."],
      ["heading", "Arredondamento e toque"],
      ["paragraph", "A cerca de 3 metros sobre a pista, inicia-se o flare com ação suave de cabrar, buscando nivelar o voo a aproximadamente 1 metro e permitindo toque suave dos trens principais."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não manter altitude de tráfego.", "Definir mal as pernas ou não corrigir vento.", "Esquecer check pré-pouso.", "Aproximar desalinhado ou fora da velocidade.", "Arredondar alto ou cabrar demais.", "Não arremeter em aproximação não estabilizada.", "Executar check pós-pouso antes de livrar a pista."]],
    ],
  },
  {
    order: 16,
    title: "Aproximações Estabilizadas",
    pages: [128, 140],
    summary: "Critérios de estabilização e aproximações 90, 180 e 360 graus.",
    tags: ["aproximacao estabilizada", "arremetida", "planeio"],
    blocks: [
      ["paragraph", "A aproximação estabilizada garante que a descida final seja executada em conformidade com a trajetória pretendida, sem manobras excessivas nas proximidades da pista. Se parâmetros não forem atendidos até 500 pés AGL, a arremetida deve ser executada."],
      ["heading", "Parâmetros"],
      ["bullet", ["Trajetória correta.", "Apenas pequenas correções de potência.", "Velocidade recomendada com tolerância de +/- 5 kt.", "Flaps de pouso aplicados.", "Checklist pré-pouso completo."]],
      ["heading", "Aproximação 90 graus na lateral"],
      ["paragraph", "Treina aproximação a partir da perna base, simulando pouso lateral em terreno disponível abaixo da rota. Exige percepção de planeio, vento e distância."],
      ["heading", "Aproximação 180 graus lateral"],
      ["paragraph", "Simula pane na perna do vento, exigindo redução de potência no través da cabeceira, voo planado, curva para base e final, avaliando afundamento e vento."],
      ["heading", "Aproximação 180 graus na vertical"],
      ["paragraph", "Inicia sobre a pista, reduz potência na vertical da cabeceira, afasta em curva e retorna para pouso no primeiro terço."],
      ["heading", "Aproximação 360 graus na vertical"],
      ["paragraph", "Simula retorno à pista após sobrevoá-la, mantendo controle em voo planado e conduzindo ao pouso no primeiro terço."],
      ["heading", "Erros comuns"],
      ["bullet", ["Não manter melhor planeio.", "Demorar para curvar.", "Curvas descoordenadas.", "Afastar-se excessivamente.", "Aplicar flap antes de garantir pouso.", "Não realizar checklist de pré-pouso."]],
    ],
  },
  {
    order: 17,
    title: "Navegação Aérea",
    pages: [142, 148],
    summary: "Planejamento, materiais, decisão GO/NO-GO, subida em rota, cruzeiro e descida.",
    tags: ["navegacao", "planejamento", "rota"],
    blocks: [
      ["paragraph", "Uma boa navegação começa antes do acionamento dos motores, com planejamento eficiente, detalhado e criterioso baseado em informações confiáveis e atualizadas."],
      ["heading", "Etapas do planejamento"],
      ["ordered", ["Consulta ao AIS pelo AIP Brasil.", "Análise meteorológica na REDEMET.", "Escolha de rota compatível com autonomia, tipo de voo e relevo.", "Separação de cartas e documentos: WAC, REA, VAC, ERC e ROTAER.", "Preenchimento do plano de voo conforme MCA 100-11 ou FPL BR.", "Peso e balanceamento dentro dos limites operacionais."]],
      ["heading", "Material necessário"],
      ["bullet", ["Cartas aeronáuticas.", "Documentos: AIP Brasil, ROTAER, plano de voo, ficha de peso e balanceamento.", "Computador de voo, calculadora, régua, transferidor, lápis, borracha, caneta e papel.", "Relógio.", "Diário de bordo, calços, óleo e mapa rodoviário opcional."]],
      ["heading", "GO/NO-GO"],
      ["paragraph", "A decisão de voo deve considerar meteorologia, visibilidade, relevo, pressões externas e alternativas. Decolar abaixo dos mínimos VFR é proibido."],
      ["heading", "Etapas do voo"],
      ["bullet", ["Subida em rota: anotar horário real de decolagem, manter proa e ajustar altímetro quando aplicável.", "Cruzeiro: manter nível, proa e controle dos horários estimados e reais.", "Descida em rota: realizar briefing de aproximação, contato ATC, reduzir potência e iniciar descida estabilizada."]],
    ],
  },
];

function node(block) {
  const [type, value] = block;
  if (type === "heading") return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: value }] };
  if (type === "paragraph") return { type: "paragraph", content: [{ type: "text", text: value }] };
  if (type === "bullet") {
    return {
      type: "bulletList",
      content: value.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] })),
    };
  }
  if (type === "ordered") {
    return {
      type: "orderedList",
      content: value.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] })),
    };
  }
  return { type: "paragraph" };
}

function contentJson(blocks) {
  return { type: "doc", content: blocks.map(node) };
}

function plainText(blocks) {
  return blocks
    .map((block) => {
      const value = block[1];
      return Array.isArray(value) ? value.join(" ") : value;
    })
    .join("\n\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contentHtml(blocks) {
  return blocks
    .map(([type, value]) => {
      if (type === "heading") return `<h2>${escapeHtml(value)}</h2>`;
      if (type === "paragraph") return `<p>${escapeHtml(value)}</p>`;
      if (type === "bullet") return `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      if (type === "ordered") return `<ol>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
      return "";
    })
    .join("\n");
}

function articleEntriesForManeuver(maneuver) {
  const errorIndex = maneuver.blocks.findIndex(([type, value]) => type === "heading" && value === "Erros comuns");
  if (errorIndex < 0) {
    return [
      {
        title: maneuver.title,
        summary: maneuver.summary,
        blocks: maneuver.blocks,
        tags: maneuver.tags,
        order: 1,
        pages: maneuver.pages,
      },
    ];
  }

  return [
    {
      title: maneuver.title,
      summary: maneuver.summary,
      blocks: maneuver.blocks.slice(0, errorIndex),
      tags: maneuver.tags,
      order: 1,
      pages: maneuver.pages,
    },
    {
      title: `Erros comuns - ${maneuver.title}`,
      summary: `Erros comuns observados na seção ${maneuver.title}.`,
      blocks: maneuver.blocks.slice(errorIndex),
      tags: [...new Set([...maneuver.tags, "erros comuns"])],
      order: 2,
      pages: maneuver.pages,
    },
  ];
}

async function findByTitle(collectionId, title) {
  const res = await db.listDocuments(DATABASE_ID, collectionId, [Query.limit(200)]);
  return res.documents.find((doc) => doc.title === title) ?? null;
}

async function upsertSection(maneuver) {
  const existing = await findByTitle(SECTIONS_COL_ID, maneuver.title);
  const data = {
    title: maneuver.title,
    description: maneuver.summary,
    order: maneuver.order,
    is_published: true,
  };
  if (existing) {
    await db.updateDocument(DATABASE_ID, SECTIONS_COL_ID, existing.$id, data);
    console.log(`  • section ${maneuver.order}: updated`);
    return existing.$id;
  }
  const created = await db.createDocument(DATABASE_ID, SECTIONS_COL_ID, ID.unique(), data);
  console.log(`  ✓ section ${maneuver.order}: created`);
  return created.$id;
}

async function upsertArticle(sectionId, article) {
  const existing = await findByTitle(ARTICLES_COL_ID, article.title);
  const json = contentJson(article.blocks);
  const data = {
    section_id: sectionId,
    subsection_id: null,
    title: article.title,
    summary: article.summary,
    content_json: JSON.stringify(json),
    content_html: contentHtml(article.blocks),
    plain_text: plainText(article.blocks),
    tags_json: JSON.stringify(article.tags),
    order: article.order,
    source_page_start: null,
    source_page_end: null,
    is_published: true,
    created_by: "pdf-seed",
  };
  if (existing) {
    await db.updateDocument(DATABASE_ID, ARTICLES_COL_ID, existing.$id, data);
    console.log(`  • article ${article.order}: updated (${article.title})`);
    return;
  }
  await db.createDocument(DATABASE_ID, ARTICLES_COL_ID, ID.unique(), data);
  console.log(`  ✓ article ${article.order}: created (${article.title})`);
}

async function main() {
  console.log("=== Import Maneuvers Content ===");
  console.log(`Importing ${MANEUVERS.length} maneuver sections/articles...\n`);
  for (const maneuver of MANEUVERS) {
    const sectionId = await upsertSection(maneuver);
    for (const article of articleEntriesForManeuver(maneuver)) {
      await upsertArticle(sectionId, article);
    }
  }
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Import failed:", error?.message ?? error);
  process.exit(1);
});
