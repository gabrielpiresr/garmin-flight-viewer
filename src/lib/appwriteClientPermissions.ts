import { Permission, Role } from "./appwrite";
import type { UserRole } from "./rbac";

export function buildActorOwnedPermissions(actorUserId: string): string[] {
  return [
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
  ];
}

/**
 * Permissões que a sessão do browser pode gravar (file/document security do Appwrite).
 * Cada papel só pode definir user da sessão + seu label (+ any/users quando permitido).
 */
export function canSetClientSidePermission(permission: string, actorUserId: string, actorRole: UserRole): boolean {
  if (permission.includes('("any")')) return true;
  if (permission.includes('("users")') || permission.includes('("users/unverified")')) return true;
  if (permission.includes(`("user:${actorUserId}")`)) return true;
  if (permission.includes(`("user:${actorUserId}/unverified")`)) return true;

  if (actorRole === "admin") return permission.includes('("label:admin")');
  if (actorRole === "instrutor") return permission.includes('("label:instrutor")');
  if (actorRole === "aluno") return permission.includes('("label:aluno")');

  return false;
}

export function filterClientSidePermissions(
  permissions: string[],
  actorUserId: string,
  actorRole: UserRole,
): string[] {
  return Array.from(
    new Set(permissions.filter((permission) => canSetClientSidePermission(permission, actorUserId, actorRole))),
  );
}

/** ACL de documentos com leitura compartilhada entre usuários autenticados. */
export function resolveSharedDocumentPermissions(actorUserId: string, actorRole: UserRole): string[] {
  const permissions = [...buildActorOwnedPermissions(actorUserId), Permission.read(Role.users())];

  if (actorRole === "admin") {
    permissions.push(
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    );
  } else if (actorRole === "instrutor") {
    permissions.push(
      Permission.read(Role.label("instrutor")),
      Permission.update(Role.label("instrutor")),
      Permission.delete(Role.label("instrutor")),
    );
  }

  return filterClientSidePermissions(permissions, actorUserId, actorRole);
}

/**
 * ACL da coleção profiles no cadastro pelo browser.
 * A coleção só aceita: any, users, user:<sessão> — sem label:* no documento.
 * Admin/instrutor leem perfis via permissão da coleção (label:admin / label:instrutor).
 */
export function resolveProfileDocumentPermissions(profileUserId: string, actorUserId: string): string[] {
  const permissions = [
    Permission.read(Role.user(profileUserId)),
    Permission.update(Role.user(profileUserId)),
    Permission.delete(Role.user(profileUserId)),
    Permission.read(Role.users()),
  ];

  const actorRole: UserRole = actorUserId === profileUserId ? "aluno" : "admin";
  return filterClientSidePermissions(permissions, actorUserId, actorRole);
}
