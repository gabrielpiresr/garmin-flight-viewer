// Overlay de tela cheia exibido durante a troca de role (multi-role) e o
// reboot subsequente. Mensagem: "Migrando para {role}".
export function RoleMigrationOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-slate-950/95 px-6 text-center backdrop-blur-sm">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      <div>
        <p className="text-lg font-black text-white">Migrando para {label}</p>
        <p className="mt-1 text-sm text-slate-400">Ajustando suas permissões e telas…</p>
      </div>
    </div>
  );
}
