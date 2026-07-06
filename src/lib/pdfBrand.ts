import { getCachedBrandSettings } from "./notificationsDb";

export type PdfBrand = {
  schoolName?: string | null;
  logoUrl?: string | null;
  logoDataUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
};

export function getPdfBrand(): PdfBrand {
  const brand = getCachedBrandSettings();
  return {
    schoolName: brand?.schoolName || "Escola de Aviacao",
    logoUrl: brand?.logoUrl || null,
    logoDataUrl: brand?.logoDataUrl || null,
    primaryColor: brand?.primaryColor || null,
    accentColor: brand?.accentColor || null,
  };
}

export function getPdfBrandLogoSrc(brand?: PdfBrand): string {
  return brand?.logoDataUrl || brand?.logoUrl || "";
}
