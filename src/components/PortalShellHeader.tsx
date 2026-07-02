import { HeaderRoleControl } from "./RoleSwitcher";

type PortalShellHeaderProps = {
  roleLabel: string;
  roleBadgeClassName: string;
  title: string;
};

/** Título da aba no header do portal (mobile/tablet: tag do papel ou switcher acima do nome). */
export function PortalShellHeader({ roleLabel, roleBadgeClassName, title }: PortalShellHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="lg:hidden">
        <HeaderRoleControl fallbackLabel={roleLabel} fallbackClassName={roleBadgeClassName} />
      </div>
      <h1 className="truncate text-base font-semibold text-slate-100">{title}</h1>
    </div>
  );
}
