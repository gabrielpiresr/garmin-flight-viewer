// Seleção pendente de usuário para a AdminUsersTab (usada pela busca global).
// Singleton + evento: cobre tanto a tab ainda não montada (pending consumido na
// montagem) quanto a tab já montada-porém-oculta (evento dispara o handler).

export type AdminUserSelectionRequest = {
  userId: string;
  email: string;
  name: string;
};

const EVENT = "admin:user-selection-requested";

let pending: AdminUserSelectionRequest | null = null;

export function requestAdminUserSelection(request: AdminUserSelectionRequest): void {
  pending = request;
  window.dispatchEvent(new Event(EVENT));
}

export function consumePendingAdminUserSelection(): AdminUserSelectionRequest | null {
  const value = pending;
  pending = null;
  return value;
}

export function subscribeAdminUserSelection(onRequest: () => void): () => void {
  window.addEventListener(EVENT, onRequest);
  return () => window.removeEventListener(EVENT, onRequest);
}
