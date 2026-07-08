// Handoff da troca de role (multi-role) através do reload do RoleSwitcher.
// O overlay "Migrando para X" precisa sobreviver ao window.location.reload(),
// então o label alvo é guardado no sessionStorage e relido no boot do App.

const KEY = "gfv:role-migrating";

export function beginRoleMigration(label: string): void {
  try {
    sessionStorage.setItem(KEY, label);
  } catch {
    /* sessionStorage indisponível — segue sem o overlay pós-reload */
  }
}

export function readRoleMigration(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function endRoleMigration(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
