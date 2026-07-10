import { useCallback, useEffect, useState } from "react";
import type { StaffCreditPurchaseStudent } from "../lib/staffCreditPurchaseDb";
import { searchStaffCreditPurchaseStudents } from "../lib/staffCreditPurchaseDb";

const MIN_SEARCH_LENGTH = 3;

type Props = {
  selectedStudent: StaffCreditPurchaseStudent | null;
  onSelectStudent: (student: StaffCreditPurchaseStudent) => void;
  onClearStudent: () => void;
};

export function StaffStudentSelector({ selectedStudent, onSelectStudent, onClearStudent }: Props) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StaffCreditPurchaseStudent[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchStudents = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchStaffCreditPurchaseStudents(trimmed);
      setSearchResults(results);
    } catch (error) {
      setSearchError((error as Error).message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStudent) return;
    const timer = window.setTimeout(() => void searchStudents(search), 300);
    return () => window.clearTimeout(timer);
  }, [search, selectedStudent, searchStudents]);

  function handleSelect(student: StaffCreditPurchaseStudent) {
    onSelectStudent(student);
    setSearch("");
    setSearchResults([]);
    setSearchError(null);
  }

  function handleClear() {
    onClearStudent();
    setSearch("");
    setSearchResults([]);
    setSearchError(null);
  }

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-200">Aluno</span>
        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-200">
                {selectedStudent.name || selectedStudent.email}
              </p>
              {selectedStudent.name && selectedStudent.email ? (
                <p className="text-sm text-slate-500">{selectedStudent.email}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-slate-500 transition hover:text-slate-300"
            >
              Trocar
            </button>
          </div>
        ) : (
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar aluno por nome ou e-mail (mín. 3 caracteres)…"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            />
            {search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH ? (
              <p className="mt-2 text-sm text-slate-500">
                Digite pelo menos {MIN_SEARCH_LENGTH} caracteres para buscar.
              </p>
            ) : null}
            {searchError ? <p className="mt-2 text-sm text-red-300">{searchError}</p> : null}
            {searchLoading ? <p className="mt-2 text-sm text-slate-500">Buscando…</p> : null}
            {!searchLoading && search.trim().length >= MIN_SEARCH_LENGTH && searchResults.length > 0 ? (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900">
                {searchResults.map((student) => (
                  <li key={student.userId}>
                    <button
                      type="button"
                      onClick={() => handleSelect(student)}
                      className="w-full px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-slate-800"
                    >
                      <span className="font-medium">{student.name || student.email}</span>
                      {student.name && student.email ? (
                        <span className="ml-1 text-slate-500">{student.email}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!searchLoading &&
            search.trim().length >= MIN_SEARCH_LENGTH &&
            searchResults.length === 0 &&
            !searchError ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum aluno encontrado.</p>
            ) : null}
          </>
        )}
      </label>
    </section>
  );
}
