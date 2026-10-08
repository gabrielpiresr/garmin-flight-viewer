import test from "node:test";
import assert from "node:assert/strict";
import { createProvaAttemptPdf } from "../src/lib/provaAttemptPdf.ts";

function fixture() {
  return {
    assignment: {
      id: "assignment-1", provaId: "prova-1", studentUserId: "student-1",
      provaTitle: "Navegação aérea", provaDescription: "Avaliação teórica",
      studentName: "João da Silva", passingPercent: 70, releasedAt: "2026-10-07T12:00:00Z",
    },
    student: { userId: "student-1", name: "João da Silva", email: "joao@example.com", cpf: "123.456.789-00", anacCode: "123456" },
    attempt: {
      id: "attempt-1", assignmentId: "assignment-1", studentUserId: "student-1",
      status: "submitted", startedAt: "2026-10-08T12:00:00Z", submittedAt: "2026-10-08T12:30:00Z",
      expiresAt: "2026-10-08T13:00:00Z", scorePercent: 0, passed: false,
      questions: [{ id: "q1", type: "mc", title: "Qual é a alternativa correta?", categoryName: "Navegação", description: "Enunciado original salvo na tentativa", payload: {
        options: [{ id: "a", text: "Opção incorreta" }, { id: "b", text: "Opção correta" }], imageUrls: [],
      } }],
      results: [{ questionId: "q1", correct: false, answer: { type: "mc", optionId: "a" }, correctReveal: { correctOptionId: "b" } }],
    },
  };
}

// Inspect the uncompressed drawing commands before jsPDF serializes the document.
const drawingText = (doc) => doc.internal.pages.flat().join("\n");

test("exports identity, Brasília dates, score and saved correction into a real PDF", async () => {
  const { doc, filename, missingImages } = await createProvaAttemptPdf(fixture());
  const text = drawingText(doc);
  for (const value of ["joao@example.com", "123.456.789-00", "123456", "08/10/2026, 09:00:00", "0h 30min 0s", "Reprovado - 0%", "Resposta do aluno", "Correta", "Enunciado original"]) {
    assert.ok(text.includes(value), `Missing ${value}`);
  }
  assert.equal(missingImages, 0);
  assert.match(filename, /^prova-Navegacao-aerea-Joao-da-Silva-attempt-1\.pdf$/);
  assert.ok(Buffer.from(doc.output("arraybuffer")).subarray(0, 8).toString().startsWith("%PDF-"));
});

test("rejects mismatched students and assignments before loading assets", async () => {
  const input = fixture();
  input.student.userId = "another-student";
  await assert.rejects(createProvaAttemptPdf(input), /não corresponde/);
  input.student.userId = "student-1";
  input.attempt.assignmentId = "another-assignment";
  await assert.rejects(createProvaAttemptPdf(input), /não corresponde/);
});

test("rejects attempts without a final correction", async () => {
  for (const patch of [{ status: "in_progress" }, { results: null }, { scorePercent: null }, { passed: null }]) {
    const input = fixture();
    Object.assign(input.attempt, patch);
    await assert.rejects(createProvaAttemptPdf(input), /ainda não está disponível/);
  }
});

test("loads repeated images once and reports unavailable images without losing answers", async () => {
  const input = fixture();
  input.attempt.questions[0].payload.imageUrls = ["https://example.com/image.png", "https://example.com/image.png"];
  input.attempt.questions[0].payload.options[0].imageUrl = "https://example.com/image.png";
  let calls = 0;
  const { doc, missingImages } = await createProvaAttemptPdf(input, async () => { calls++; return null; });
  assert.equal(calls, 1);
  assert.equal(missingImages, 1);
  assert.ok(drawingText(doc).includes("Imagem indispon"));
  assert.ok(drawingText(doc).includes("Resposta do aluno"));
});

test("expired attempts use the deadline instead of a later grading time", async () => {
  const input = fixture();
  input.attempt.status = "expired";
  input.attempt.submittedAt = "2026-10-10T15:00:00Z";
  const { doc } = await createProvaAttemptPdf(input);
  assert.ok(drawingText(doc).includes("1h 0min 0s"));
  assert.ok(drawingText(doc).includes("08/10/2026, 10:00:00"));
});

test("paginates long statements and preserves unanswered and map/image corrections", async () => {
  const input = fixture();
  input.attempt.questions[0].description = "Enunciado extenso para testar quebra de página. ".repeat(1800);
  input.attempt.results[0].answer = null;
  for (const type of ["map", "image"]) {
    input.attempt.questions.push({ id: type, type, title: `Questão ${type}`, categoryName: "Identificação", description: "", payload: {} });
    input.attempt.results.push({ questionId: type, correct: false, answer: null, correctReveal: { clickArea: type === "map" ? { latLngs: [{ lat: -23, lng: -46 }, { lat: -24, lng: -46 }, { lat: -24, lng: -45 }] } : { pctPoints: [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 30, y: 40 }] } } });
  }
  const { doc } = await createProvaAttemptPdf(input);
  assert.ok(doc.getNumberOfPages() > 5);
  const text = drawingText(doc);
  assert.ok(text.includes("-23.000000, -46.000000"));
  assert.ok(text.includes("10.00, 10.00"));
  assert.ok(text.includes("respondida"));
  for (const page of doc.internal.pages.slice(1)) assert.ok(page.join("\n").includes(` / ${doc.getNumberOfPages()}`));
});
