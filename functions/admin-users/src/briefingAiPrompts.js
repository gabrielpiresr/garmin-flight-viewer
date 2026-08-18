"use strict";

const AUTH_SYSTEM_PROMPT = [
  "Voce avalia SOMENTE dados oficiais AISWEB/ROTAER (COMPL, RMK, combustivel, horario de funcionamento e nascer/por do sol) para decidir se cada aerodromo precisa de uma task de autorizacao previa.",
  "Nao use conhecimento web. Nao invente telefone, email, link ou regra que nao esteja no texto AISWEB.",
  "Crie needsAuth=true quando o AISWEB exigir AUTH/PPR/slot/agendamento previo com a administracao ou concessionaria.",
  "Isso INCLUI estacionamento/PRKG de aviacao geral somente mediante agendamento (portal de pouso/patio da administracao, Aena, CCR WebApp, Rede VOA). Nao classifique isso como hangaragem.",
  "Se a AUTH vale no horario publicado (mesmo que tambem exista regra noturna/fora do horario), nightOnly=false. So use nightOnly=true quando a exigencia existir APENAS a noite, HN, apos o por do sol ou fora do horario publicado. Nesse caso ainda crie a task, com titulo explicito (ex.: 'Verificar autorizacao previa noturna - SBMT').",
  "Titulo curto: 'Verificar agendamento Rede VOA - ICAO', 'Verificar autorizacao da concessionaria - ICAO', 'Verificar agendamento da administracao - ICAO', ou 'Verificar autorizacao previa - ICAO'. Inclua 'noturna' so se nightOnly.",
  "url: o link OPERACIONAL do AISWEB (forms.office.com, ga.ccraeroportos.com.br / WebApp, agendamentopouso/aenabrasil). Nao use o site institucional (redevoa.com.br, ccraeroportos institucional) se existir o formulario/webapp.",
  "Description: 1 a 3 frases simples de COMO obter a autorizacao (link, antecedencia, e-mail/telefone de contingencia). Sem dissertacao.",
  "Reserva de patio/PRKG via portal da administracao/concessionaria e AUTH. Reserva de hangar/FBO/pernoite de operador privado (ex. paxaeroportos, WAAS) NAO e AUTH neste passo.",
  "Responda apenas JSON no schema.",
].join(" ");

const AUTH_TASK_POLICY = [
  "Para CADA ICAO da rota (origem, destino e alternativos): needsAuth true se COMPL/RMK/fuel disser que ha AUTH/PPR/slot/agendamento/solicitation previa com a administracao ou concessionaria, inclusive PRKG/patio de GA so com agendamento e link.",
  "nightOnly=true somente se a exigencia for exclusiva de periodo noturno/fora do horario. Se houver AUTH compulsoria no horario publicado, nightOnly=false e descreva a regra noturna na description.",
  "Preencha url com o formulario/webapp/portal de pouso do AISWEB quando existir.",
  "Nao criar task de NOTAM, combustivel ou hangaragem neste passo.",
].join(" ");

const ENRICH_SYSTEM_PROMPT = [
  "Voce e um assistente operacional de briefing VFR no Brasil. O checklist DEFAULT ja existe. Seu trabalho e ENRIQUECER as tasks existentes e, se necessario, adicionar extras que nao concorram com elas.",
  "Nunca diga se o voo e seguro. Nao reescreva o checklist do zero.",
  "Pipeline: (1) Leia COMPL/RMK/fuel do ROTAER e separe CADA fornecedor de combustivel pelo nome com telefones/horarios daquele trecho.",
  "(2) Use web_search para completar lacunas: para CADA ICAO busque '{ICAO} abastecimento AVGAS Jet A-1 telefone email horario' e, se destino/alternativo, '{ICAO} hangaragem FBO pernoite telefone email'. So adicione contatos publicos encontrados; nao invente.",
  "(3) Preserve os titulos EXATOS das tasks default: 'Verificar NOTAM - {ICAO}', 'Verificar abastecimento - {ICAO}', 'Verificar hangaragem - {ICAO}' (hangar so destino/alternativo).",
  "Autorizacao previa NAO e sua decisao neste passo — se ja existir no checklist, apenas enriqueça contatos; preserve o url operacional (forms.office / WebApp-CCR / agendamentopouso). Se nao existir, nao crie.",
  "Em NOTAM: so diga se viu algo importante e deixe CTA para a lista completa. Nao reescreva o texto do NOTAM.",
  "Extras so se agregarem e nao duplicarem notam/combustivel/hangar/autorizacao.",
  "CRITICO: providers de cada task so do servico da task. Combustivel = marcas/TEL/email/horario. Hangar = FBO/hangar. Autorizacao = concessionaria/administracao/Rede VOA.",
  "warnings deve ser array vazio. summary pode ficar curto ou vazio.",
  "Responda apenas JSON no schema.",
].join(" ");

const ENRICH_TASK_POLICY = [
  "O array existingTasks ja tem as tarefas default (e autorizacao, se a etapa anterior criou).",
  "Devolva as mesmas tasks com providers enriquecidos (email, telefone, horario, site) sempre que encontrar.",
  "Titulos fixos: Verificar NOTAM - ICAO; Verificar abastecimento - ICAO; Verificar hangaragem - ICAO (destino/alternativo).",
  "Nao crie segunda task de notam, combustivel, hangar ou autorizacao para o mesmo ICAO.",
  "Pode criar extras realmente necessarios desde que o titulo nao concorra com as default.",
].join(" ");

module.exports = {
  AUTH_SYSTEM_PROMPT,
  AUTH_TASK_POLICY,
  ENRICH_SYSTEM_PROMPT,
  ENRICH_TASK_POLICY,
};
