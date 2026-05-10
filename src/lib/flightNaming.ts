/** Nome automático para o voo salvo (horário local do primeiro instante do arquivo, se houver). */
export function suggestFlightName(chartTimeBaseMs: number | null, sourceFileName: string): string {
  if (chartTimeBaseMs != null && Number.isFinite(chartTimeBaseMs)) {
    const d = new Date(chartTimeBaseMs);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `Voo ${y}-${mo}-${day} ${h}h${min}`;
  }
  const stem = sourceFileName.replace(/\.[^.]+$/i, "").trim().slice(0, 48) || "importacao";
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `${stem} — ${stamp}`;
}
