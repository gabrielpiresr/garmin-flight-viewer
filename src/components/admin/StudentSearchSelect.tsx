import { useEffect, useMemo, useState } from "react";
import type { StudentIdentity } from "../../types/schedule";

type StudentSearchSelectProps = {
  label: string;
  students: StudentIdentity[];
  value: string;
  onChange: (student: StudentIdentity) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function studentDisplayName(student: StudentIdentity): string {
  return (student.nickname || "").trim() || student.label;
}

function formatStudentLabel(student: StudentIdentity): string {
  const email = student.email || "sem email";
  const anac = student.anacCode || "sem ANAC";
  return `${studentDisplayName(student)} · ${email} · ${anac}`;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function studentSearchText(student: StudentIdentity): string {
  return normalizeSearch(
    [student.nickname, student.label, student.email, student.anacCode, student.userId].filter(Boolean).join(" "),
  );
}

export function StudentSearchSelect({
  label,
  students,
  value,
  onChange,
  disabled = false,
  placeholder = "Pesquise por nickname, nome, email ou ANAC",
  className = "",
}: StudentSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedStudent = useMemo(
    () => students.find((student) => student.userId === value) ?? null,
    [students, value],
  );

  useEffect(() => {
    setQuery(selectedStudent ? formatStudentLabel(selectedStudent) : value);
  }, [selectedStudent, value]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const sorted = [...students].sort((a, b) =>
      studentDisplayName(a).localeCompare(studentDisplayName(b), "pt-BR"),
    );
    if (!normalizedQuery || (selectedStudent?.userId === value && query === formatStudentLabel(selectedStudent))) {
      return sorted.slice(0, 30);
    }
    return sorted.filter((student) => studentSearchText(student).includes(normalizedQuery)).slice(0, 30);
  }, [query, selectedStudent, students, value]);

  return (
    <label className={`relative text-xs text-slate-400 ${className}`}>
      {label}
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500 disabled:opacity-50"
      />
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {filteredStudents.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">Nenhum aluno encontrado.</div>
          ) : (
            filteredStudents.map((student) => (
              <button
                key={student.userId}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(student);
                  setQuery(formatStudentLabel(student));
                  setOpen(false);
                }}
                className="w-full border-b border-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-800/80"
              >
                <p className="font-medium text-slate-100">{studentDisplayName(student)}</p>
                <p className="text-xs text-slate-500">
                  {student.email || "Sem email"} · ANAC {student.anacCode || "—"}
                </p>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
