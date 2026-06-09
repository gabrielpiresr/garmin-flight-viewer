export type ProposalDifferential = {
  id: string;
  title: string;
  description: string;
  imageFileId: string | null;
};

export type ProposalSection = {
  id: string;
  title: string;
  description: string;
  imageIds: string[];
  videoUrl?: string;
  triggerProductKeyword?: string;
};

export type ProposalConfig = {
  id: string;
  schoolId: string;
  differentials: ProposalDifferential[];
  sections: ProposalSection[];
  paymentMethodsRichJson: Record<string, unknown> | null;
  additionalInfoRichJson: Record<string, unknown> | null;
  schoolName: string;
  logoUrl: string;
  coverVideoUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
};

export type ProposalConfigInput = Omit<ProposalConfig, "id">;

/** Extrai o embed URL de um link do YouTube, ou null se inválido */
export function youtubeEmbedUrl(url: string): string | null {
  if (!url?.trim()) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0` : null;
}

export type ProposalProduct = {
  id: string;
  name: string;
  price: number;
};

export type CrmProposal = {
  id: string;
  schoolId: string;
  leadId: string;
  leadName: string;
  leadEmail: string;
  hours: number;
  hourPrice: number;
  totalValue: number;
  products: ProposalProduct[];
  notes: string;
  publicToken: string;
  status: "draft" | "sent";
  caktoOfferId: string;
  paymentUrl: string;
  paymentStatus: "pending" | "created" | "paid" | "failed";
  paymentError: string;
  paymentUpdatedAt: string | null;
  proposalType: "commercial" | "student_credit_package";
  studentUserId: string;
  creditPackageId: string;
  creditPackageSnapshot: {
    packageId: string;
    hours: number;
    hourPrice: number;
    totalValue: number;
    validityDays: number;
    aircraftModelId: string;
    aircraftModelName: string;
  } | null;
  creditId: string;
  createdAt: string;
};

export type CrmProposalInput = {
  leadId: string;
  leadName: string;
  leadEmail: string;
  hours: number;
  hourPrice: number;
  products: ProposalProduct[];
  notes?: string;
};
