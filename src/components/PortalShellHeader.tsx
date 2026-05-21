type PortalShellHeaderProps = {
  roleLabel: string;
  roleBadgeClassName: string;
  title: string;
};

/** Título da aba no header do portal (mobile: tag do papel acima do nome). */
export function PortalShellHeader({ roleLabel, roleBadgeClassName, title }: PortalShellHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={`w-fit rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest lg:hidden ${roleBadgeClassName}`}
      >
        {roleLabel}
      </span>
      <h1 className="truncate text-base font-semibold text-slate-100">{title}</h1>
    </div>
  );
}
