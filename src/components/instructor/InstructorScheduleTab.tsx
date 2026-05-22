export function InstructorScheduleTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Escala</h2>
        <p className="text-xs text-slate-500">Visualização da escala de voos da escola.</p>
      </div>
      <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="mx-auto mb-3 h-8 w-8 text-slate-600"
        >
          <path
            fillRule="evenodd"
            d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm font-medium text-slate-400">Escala em desenvolvimento</p>
        <p className="mt-1 text-xs text-slate-600">A visualização da escala de voos estará disponível em breve.</p>
      </div>
    </div>
  );
}
