import { useEffect, useState } from "react";
import { Query } from "appwrite";
import { useAuth } from "../../contexts/AuthContext";
import { databases, INSTRUCTOR_STUDENTS_COL_ID } from "../../lib/appwrite";
import { StudentObservationsSection } from "../admin/StudentObservationsSection";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const PROFILES_COL_ID = import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID as string | undefined;

type StudentSummary = {
  userId: string;
  fullName: string;
  email: string;
};

type InstructorStudentDoc = {
  $id: string;
  student_user_id: string;
};

type ProfileDoc = {
  $id: string;
  user_id: string;
  full_name: string;
  email: string;
};

export function InstructorStudentsTab() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !databases || !DB_ID) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    databases
      .listDocuments(DB_ID, INSTRUCTOR_STUDENTS_COL_ID, [
        Query.equal("instructor_user_id", user.id),
        Query.limit(100),
      ])
      .then(async (res) => {
        const docs = res.documents as unknown as InstructorStudentDoc[];
        const studentIds = docs.map((d) => d.student_user_id);
        if (studentIds.length === 0) {
          setStudents([]);
          return;
        }
        if (!PROFILES_COL_ID) {
          setStudents(studentIds.map((id) => ({ userId: id, fullName: "", email: id })));
          return;
        }
        const profilesRes = await databases!.listDocuments(DB_ID!, PROFILES_COL_ID, [
          Query.equal("user_id", studentIds),
          Query.limit(100),
        ]);
        const profiles = profilesRes.documents as unknown as ProfileDoc[];
        const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
        setStudents(
          studentIds.map((id) => {
            const p = profileMap.get(id);
            return { userId: id, fullName: p?.full_name ?? "", email: p?.email ?? id };
          }),
        );
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [user]);

  const selectedStudent = students.find((s) => s.userId === selectedStudentId);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="w-64 shrink-0 overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900/40">
        <div className="border-b border-slate-700/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Meus alunos</p>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/40" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-red-400">{error}</p>
        ) : students.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nenhum aluno atribuído.</p>
        ) : (
          <div className="space-y-1 p-2">
            {students.map((student) => {
              const isActive = selectedStudentId === student.userId;
              return (
                <button
                  key={student.userId}
                  type="button"
                  onClick={() => setSelectedStudentId(student.userId)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                  }`}
                >
                  <p className="truncate text-sm font-medium">
                    {student.fullName || student.email}
                  </p>
                  {student.fullName ? (
                    <p className="truncate text-[10px] text-slate-500">{student.email}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {selectedStudent && user ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aluno selecionado</p>
              <p className="mt-1 text-base font-semibold text-slate-100">
                {selectedStudent.fullName || selectedStudent.email}
              </p>
              {selectedStudent.fullName ? (
                <p className="text-xs text-slate-500">{selectedStudent.email}</p>
              ) : null}
            </div>
            <StudentObservationsSection
              studentUserId={selectedStudent.userId}
              currentUser={{ id: user.id, name: user.name || user.email, role: "instrutor" }}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
            Selecione um aluno para ver e adicionar observações internas.
          </div>
        )}
      </div>
    </div>
  );
}
