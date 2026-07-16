import { useEffect, useState } from "react";
import { getCachedBrandSettings, getEmailBrandSettings } from "../lib/notificationsDb";

type SidebarBrandProps = {
  fallbackLabel: string;
  fallbackClassName: string;
};

export function SidebarBrand({ fallbackLabel, fallbackClassName }: SidebarBrandProps) {
  const [brand, setBrand] = useState(() => getCachedBrandSettings());
  const logoUrl = brand?.logoDataUrl || brand?.logoUrl || "";
  const schoolName = brand?.schoolName || "Escola";

  useEffect(() => {
    let cancelled = false;
    void getEmailBrandSettings()
      .then((settings) => {
        if (!cancelled) setBrand(settings);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={schoolName}
        className="h-9 max-w-[140px] object-contain object-left"
      />
    );
  }

  return <span className={fallbackClassName}>{fallbackLabel}</span>;
}
