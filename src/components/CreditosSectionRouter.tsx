import { lazy, Suspense, useEffect, useState } from "react";
import { isFlightCreditPurchasePath } from "../lib/routedTabs";
import { Skeleton } from "./ui/Skeleton";

const CreditosTab = lazy(() => import("./CreditosTab").then((module) => ({ default: module.CreditosTab })));
const FlightCreditPurchasePage = lazy(() =>
  import("../pages/FlightCreditPurchasePage").then((module) => ({ default: module.FlightCreditPurchasePage })),
);

function CreditosLoading() {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-52 rounded-xl" />
    </section>
  );
}

export function CreditosSectionRouter() {
  const [isPurchasePage, setIsPurchasePage] = useState(() => isFlightCreditPurchasePath());

  useEffect(() => {
    const sync = () => setIsPurchasePage(isFlightCreditPurchasePath());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return (
    <Suspense fallback={<CreditosLoading />}>
      {isPurchasePage ? <FlightCreditPurchasePage /> : <CreditosTab />}
    </Suspense>
  );
}
