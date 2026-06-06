export type CaktoSettings = {
  clientId: string;
  productId: string;
  secretConfigured: boolean;
  webhookUrl: string;
  updatedAt: string | null;
};

export type CaktoSettingsInput = {
  clientId: string;
  clientSecret?: string | null;
  productId: string;
};

export type CaktoReceipt = {
  id: string;
  eventId: string;
  eventType: string;
  orderId: string;
  offerId: string;
  productId: string;
  proposalId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  fulfillmentStatus: string;
  fulfillmentError: string;
  fulfillmentUpdatedAt: string | null;
  creditId: string;
  eventAt: string | null;
  receivedAt: string;
  payloadJson: string;
};

export type CaktoReceiptFilters = {
  search?: string;
  eventType?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type CaktoReceiptPage = {
  receipts: CaktoReceipt[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    approved: number;
    refunded: number;
    pending: number;
  };
};
