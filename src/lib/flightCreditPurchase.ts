import type { FlightCreditPackage } from "../types/flightCreditSales";

export type CreditAvailability = "any" | "weekday";

export function formatPurchaseCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatHoursLabel(hours: number): string {
  if (Number.isInteger(hours)) return `${hours} hora${hours === 1 ? "" : "s"}`;
  return `${hours.toFixed(1).replace(".", ",")} horas`;
}

export function packageReferenceForCustomHours(packages: FlightCreditPackage[], customHours: number) {
  if (!packages.length) return null;
  const sorted = [...packages].sort((a, b) => a.hours - b.hours);
  if (!Number.isFinite(customHours) || customHours <= 0) return sorted[0];
  return [...sorted].reverse().find((item) => item.hours <= customHours) ?? sorted[0];
}

export function effectiveHourPrice(
  basePrice: number,
  availability: CreditAvailability,
  discountPct: number | null,
  weekdayDiscountEligible = true,
): number {
  if (
    availability === "weekday" &&
    weekdayDiscountEligible &&
    discountPct != null &&
    discountPct > 0 &&
    discountPct < 100
  ) {
    return Number((basePrice * (1 - discountPct / 100)).toFixed(2));
  }
  return basePrice;
}

export function isWeekdayDiscountEligible(pkg: FlightCreditPackage): boolean {
  return pkg.weekdayDiscountEligible !== false;
}

export function renderCheckoutLoading(target: Window) {
  target.document.open();
  target.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Preparando pagamento</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #020617;
        color: #e2e8f0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { max-width: 420px; padding: 32px; text-align: center; }
      .spinner {
        width: 52px;
        height: 52px;
        margin: 0 auto 24px;
        border: 4px solid #1e293b;
        border-top-color: #10b981;
        border-radius: 999px;
        animation: spin .8s linear infinite;
      }
      h1 { margin: 0; font-size: 22px; }
      p { margin: 12px 0 0; color: #94a3b8; line-height: 1.6; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main>
      <div class="spinner" aria-hidden="true"></div>
      <h1>Preparando seu pagamento</h1>
      <p>Aguarde alguns segundos. Você será direcionado automaticamente para o checkout seguro.</p>
    </main>
  </body>
</html>`);
  target.document.close();
}
