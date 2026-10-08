import { jsPDF } from "jspdf";
import type { PdfBrand } from "./pdfBrand";
import type { ProvaAssignment, ProvaAttempt, ProvaMcOption, ProvaQuestionResult, ProvaSanitizedQuestion } from "../types/provas";

type StudentData = { userId: string; name: string; email?: string; cpf?: string; anacCode?: string };
type PdfImage = { dataUrl: string; width: number; height: number };
type Point = { x: number; y: number };
type PdfInput = { assignment: ProvaAssignment; attempt: ProvaAttempt; student: StudentData; brand?: PdfBrand };

const TIME_ZONE = "America/Sao_Paulo";
const MARGIN = 16;
const WIDTH = 178;
const BOTTOM = 276;

function formatDate(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "medium" })
    : "Não informado";
}

function duration(attempt: ProvaAttempt) {
  // Expired attempts can be graded later, so the deadline bounds their duration.
  const end = attempt.status === "expired" ? attempt.expiresAt : attempt.submittedAt;
  const seconds = end ? Math.floor((Date.parse(end) - Date.parse(attempt.startedAt)) / 1000) : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return "Não informada";
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min ${seconds % 60}s`;
}

function optionsOf(question: ProvaSanitizedQuestion): ProvaMcOption[] {
  return Array.isArray(question.payload.options) ? question.payload.options as ProvaMcOption[] : [];
}

function imageUrls(question: ProvaSanitizedQuestion): string[] {
  if (question.type === "image") return [String(question.payload.imageUrl || "")].filter(Boolean);
  if (question.type !== "mc") return [];
  return [
    ...(Array.isArray(question.payload.imageUrls) ? question.payload.imageUrls.filter((url): url is string => typeof url === "string") : []),
    ...optionsOf(question).map((option) => option.imageUrl || ""),
  ].filter(Boolean);
}

async function loadImage(url: string): Promise<PdfImage | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (value: PdfImage | null) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 10000);
    image.crossOrigin = "anonymous";
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        finish({ dataUrl: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height });
      } catch {
        finish(null);
      }
    };
    image.src = url;
  });
}

function polygonPoints(result: ProvaQuestionResult, type: "map" | "image"): Point[] {
  const area = result.correctReveal?.clickArea as { latLngs?: Array<{ lat: number; lng: number }>; pctPoints?: Point[] } | undefined;
  const points = type === "image" ? area?.pctPoints : area?.latLngs?.map((p) => ({ x: p.lng, y: p.lat }));
  return (points ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** Uses only the saved attempt, so later edits to the question bank cannot change the report. */
export async function createProvaAttemptPdf(
  input: PdfInput,
  imageLoader: (url: string) => Promise<PdfImage | null> = loadImage,
): Promise<{ doc: jsPDF; filename: string; missingImages: number }> {
  const { assignment, attempt, student, brand } = input;
  if (attempt.assignmentId !== assignment.id || attempt.studentUserId !== student.userId) {
    throw new Error("A tentativa não corresponde à prova e ao aluno selecionados.");
  }
  if (attempt.status === "in_progress" || !attempt.results || attempt.scorePercent == null || attempt.passed == null) {
    throw new Error("A correção desta prova ainda não está disponível para exportação.");
  }
  const urls = [...new Set(attempt.questions.flatMap(imageUrls))];
  const assets = new Map(await Promise.all(urls.map(async (url) => [url, await imageLoader(url)] as const)));
  const doc = new jsPDF({ format: "a4", unit: "mm", compress: true });
  doc.setProperties({ title: `${assignment.provaTitle} - ${student.name}`, subject: "Prova corrigida", author: brand?.schoolName || "Escola de Aviação" });
  let y = 29;

  function header() {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor("#475569");
    const school = doc.splitTextToSize(brand?.schoolName || "Escola de Aviação", WIDTH)[0];
    doc.text(school, MARGIN, 15);
    doc.setDrawColor("#cbd5e1").setLineWidth(0.3).line(MARGIN, 20, 194, 20);
  }
  function room(height: number) {
    if (y + height > BOTTOM) {
      doc.addPage();
      header();
      y = 29;
    }
  }
  function text(value: string, { size = 10, bold = false, color = "#1e293b", gap = 2 } = {}) {
    const lineHeight = size * 0.48;
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    const lines = doc.splitTextToSize(value || "-", WIDTH) as string[];
    for (const line of lines) {
      room(lineHeight);
      // A new page header changes font settings, so restore them for each line.
      doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(color);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
    y += gap;
  }
  function section(title: string) {
    room(22);
    y += 3;
    text(title, { size: 12, bold: true, color: "#0369a1", gap: 4 });
  }
  function field(label: string, value: string | undefined) {
    text(`${label}: ${value?.trim() || "Não informado"}`);
  }
  function polygon(points: Point[], project: (p: Point) => Point) {
    if (points.length < 3) return;
    const projected = points.map(project);
    doc.setDrawColor("#15803d").setFillColor("#dcfce7").setLineWidth(0.6);
    doc.lines(projected.slice(1).map((p, index) => [p.x - projected[index].x, p.y - projected[index].y]), projected[0].x, projected[0].y, [1, 1], "FD", true);
  }
  function marker(point: Point) {
    doc.setFillColor("#e11d48").setDrawColor("#ffffff").setLineWidth(0.4).circle(point.x, point.y, 1.7, "FD");
  }
  function legend() {
    text("Área correta: contorno verde. Resposta do aluno: ponto vermelho.", { size: 9, color: "#475569" });
  }
  function image(url: string, result?: ProvaQuestionResult) {
    const asset = assets.get(url);
    if (!asset) {
      text("Imagem indisponível na exportação.", { size: 9, color: "#92400e" });
      return;
    }
    const scale = Math.min(WIDTH / asset.width, 85 / asset.height);
    const width = asset.width * scale;
    const height = asset.height * scale;
    room(height + 16);
    const top = y;
    const left = MARGIN + (WIDTH - width) / 2;
    doc.addImage(asset.dataUrl, "JPEG", left, top, width, height);
    if (result) {
      // Outline on the original image keeps the question visible underneath.
      const points = polygonPoints(result, "image").map((p) => ({ x: left + p.x / 100 * width, y: top + p.y / 100 * height }));
      if (points.length >= 3) {
        doc.setDrawColor("#15803d").setLineWidth(0.8);
        doc.lines(points.slice(1).map((p, index) => [p.x - points[index].x, p.y - points[index].y]), points[0].x, points[0].y, [1, 1], "S", true);
      }
      if (result.answer?.type === "image" && result.answer.pctPoint) {
        marker({ x: left + result.answer.pctPoint.x / 100 * width, y: top + result.answer.pctPoint.y / 100 * height });
      }
    }
    y += height + 6;
    if (result) legend();
  }
  function mapDiagram(result: ProvaQuestionResult) {
    const points = polygonPoints(result, "map");
    const answer = result.answer?.type === "map" ? result.answer.latLng : null;
    const point = answer ? { x: answer.lng, y: answer.lat } : null;
    const all = [...points, ...(point ? [point] : [])];
    if (!all.length) return;
    room(85);
    const left = MARGIN;
    const top = y;
    const height = 64;
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const cosLat = Math.max(0.01, Math.cos((minY + maxY) / 2 * Math.PI / 180));
    const scale = Math.min((WIDTH - 20) / Math.max((maxX - minX) * cosLat, 0.0001), (height - 16) / Math.max(maxY - minY, 0.0001));
    const project = (p: Point): Point => ({ x: left + WIDTH / 2 + (p.x - (minX + maxX) / 2) * cosLat * scale, y: top + height / 2 - (p.y - (minY + maxY) / 2) * scale });
    doc.setDrawColor("#cbd5e1").setFillColor("#f8fafc").setLineWidth(0.3).rect(left, top, WIDTH, height, "FD");
    polygon(points, project);
    if (point) marker(project(point));
    y += height + 6;
    text("Esquema geográfico da correção (norte para cima).", { size: 9, color: "#475569" });
    legend();
  }

  header();
  text("Prova corrigida", { size: 20, bold: true, color: "#0f172a", gap: 3 });
  text(assignment.provaTitle, { size: 14, bold: true });
  if (assignment.provaDescription) text(assignment.provaDescription, { color: "#475569" });
  section("Dados do aluno");
  field("Nome", student.name || assignment.studentName);
  field("E-mail", student.email);
  field("CPF", student.cpf);
  field("Código ANAC", student.anacCode);
  field("Identificação do aluno", student.userId);
  section("Realização da prova");
  field("Liberada em", formatDate(assignment.releasedAt));
  field("Início", formatDate(attempt.startedAt));
  field(attempt.status === "expired" ? "Encerramento por prazo" : "Entrega", formatDate(attempt.status === "expired" ? attempt.expiresAt : attempt.submittedAt));
  field("Duração", duration(attempt));
  field("Fuso horário", "Brasília (America/Sao_Paulo)");
  field("Tentativa", attempt.id);
  section("Resultado final");
  text(`${attempt.passed ? "Aprovado" : "Reprovado"} - ${attempt.scorePercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, { size: 15, bold: true, color: attempt.passed ? "#15803d" : "#be123c" });
  field("Mínimo para aprovação", `${assignment.passingPercent}%`);
  field("Acertos", `${attempt.results.filter((r) => r.correct).length} de ${attempt.questions.length} questões`);
  if (attempt.status === "expired") text("Tentativa encerrada por esgotamento do prazo.", { color: "#92400e" });

  const results = new Map(attempt.results.map((result) => [result.questionId, result]));
  function textHeight(value: string, size = 10, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    return doc.splitTextToSize(value || "-", WIDTH).length * size * 0.48 + 2;
  }
  function imageHeight(url: string) {
    const asset = assets.get(url);
    return asset ? Math.min(WIDTH / asset.width, 85 / asset.height) * asset.height + 6 : textHeight("Imagem indisponível na exportação.", 9);
  }
  function questionHeight(question: ProvaSanitizedQuestion, result: ProvaQuestionResult | undefined, index: number) {
    let height = 9 + textHeight(`${index + 1}. ${question.title}`, 12, true) + textHeight(`${question.categoryName} - Acertou`, 9, true);
    if (question.description) height += textHeight(question.description);
    if (!result) return height;
    if (question.type === "mc") {
      const urls = Array.isArray(question.payload.imageUrls) ? question.payload.imageUrls : [];
      for (const url of urls) if (typeof url === "string" && url) height += imageHeight(url);
      for (const option of optionsOf(question)) {
        height += textHeight(`A) ${option.text} [Resposta do aluno / Correta]`, 10, true);
        if (option.imageUrl) height += imageHeight(option.imageUrl);
      }
      return height + textHeight("Resposta do aluno: Não respondida");
    }
    const type = question.type;
    height += type === "image" ? imageHeight(String(question.payload.imageUrl || "")) + textHeight("Área correta: contorno verde. Resposta do aluno: ponto vermelho.", 9) : 85;
    height += textHeight("Resposta do aluno: Latitude: -00.000000, longitude: -00.000000");
    height += textHeight(`Área correta (${type === "image" ? "x, y em %" : "latitude, longitude"}): ${polygonPoints(result, type).map((p) => `(${p.y.toFixed(6)}, ${p.x.toFixed(6)})`).join("; ")}`);
    return height;
  }
  section("Questões corrigidas");
  for (const [index, question] of attempt.questions.entries()) {
    const result = results.get(question.id);
    const height = questionHeight(question, result, index);
    // Keep questions that fit on one page together, including their visual correction.
    room(height <= BOTTOM - 29 ? height : 30);
    doc.setDrawColor("#e2e8f0").setLineWidth(0.3).line(MARGIN, y - 1, 194, y - 1);
    y += 5;
    text(`${index + 1}. ${question.title}`, { size: 12, bold: true });
    text(`${question.categoryName} - ${result ? result.correct ? "Acertou" : "Errou" : "Correção indisponível"}`, { size: 9, bold: true, color: result?.correct ? "#15803d" : "#be123c" });
    if (question.description) text(question.description);
    if (!result) continue;
    if (question.type === "mc") {
      const urls = Array.isArray(question.payload.imageUrls) ? question.payload.imageUrls : [];
      for (const url of urls) if (typeof url === "string" && url) image(url);
      const options = optionsOf(question);
      const selected = result.answer?.type === "mc" ? result.answer.optionId : null;
      const correctId = result.correctReveal?.correctOptionId;
      for (const [optionIndex, option] of options.entries()) {
        const letter = String.fromCharCode(65 + optionIndex);
        const labels = [option.id === selected ? "Resposta do aluno" : "", option.id === correctId ? "Correta" : ""].filter(Boolean);
        text(`${letter}) ${option.text || `Alternativa ${letter}`}${labels.length ? ` [${labels.join(" / ")}]` : ""}`, { bold: labels.length > 0, color: option.id === correctId ? "#15803d" : option.id === selected ? "#be123c" : "#1e293b" });
        if (option.imageUrl) image(option.imageUrl);
      }
      if (!selected) field("Resposta do aluno", "Não respondida");
    } else if (question.type === "image") {
      image(String(question.payload.imageUrl || ""), result);
      const point = result.answer?.type === "image" ? result.answer.pctPoint : null;
      field("Resposta do aluno", point ? `x: ${point.x.toFixed(2)}%, y: ${point.y.toFixed(2)}%` : "Não respondida");
      field("Área correta (x, y em %)", polygonPoints(result, "image").map((p) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`).join("; "));
    } else {
      mapDiagram(result);
      const point = result.answer?.type === "map" ? result.answer.latLng : null;
      field("Resposta do aluno", point ? `Latitude: ${point.lat.toFixed(6)}, longitude: ${point.lng.toFixed(6)}` : "Não respondida");
      field("Área correta (latitude, longitude)", polygonPoints(result, "map").map((p) => `(${p.y.toFixed(6)}, ${p.x.toFixed(6)})`).join("; "));
    }
    y += 4;
  }
  const pages = doc.getNumberOfPages();
  const generatedAt = formatDate(new Date().toISOString());
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor("#cbd5e1").setLineWidth(0.3).line(MARGIN, 283, 194, 283);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor("#64748b");
    doc.text(`Gerado em ${generatedAt} (Brasília)`, MARGIN, 289);
    doc.text(`${page} / ${pages}`, 194, 289, { align: "right" });
  }
  const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "prova";
  return { doc, filename: `prova-${slug(assignment.provaTitle)}-${slug(student.name)}-${slug(attempt.id)}.pdf`, missingImages: [...assets.values()].filter((asset) => !asset).length };
}

export async function downloadProvaAttemptPdf(input: PdfInput): Promise<number> {
  const { doc, filename, missingImages } = await createProvaAttemptPdf(input);
  await doc.save(filename, { returnPromise: true });
  return missingImages;
}
