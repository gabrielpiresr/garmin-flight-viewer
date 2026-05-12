import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getStudentCreditStatement } from "../lib/creditsDb";
import type { StudentCreditStatement } from "../types/credits";
import { CreditStatementView } from "./CreditStatementView";
import { Skeleton } from "./ui/Skeleton";

export function CreditosTab() {
  const { user, configured } = useAuth();
  const [statement, setStatement] = useState<StudentCreditStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !configured) {
      setStatement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getStudentCreditStatement({
        viewer: { userId: user.id, role: user.role },
        studentUserId: user.id,
      });
      setStatement(next);
    } catch (e) {
      setError((e as Error).message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [configured, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
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

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
        <p className="text-sm text-red-200">{error}</p>
      </section>
    );
  }

  if (!statement) {
    return (
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
        <p className="text-sm text-slate-500">Créditos indisponíveis no momento.</p>
      </section>
    );
  }

  return (
    <CreditStatementView
      statement={statement}
      title="Meus créditos"
      description="Saldo por modelo de avião, compras realizadas e horas consumidas pelos voos executados."
    />
  );
}
