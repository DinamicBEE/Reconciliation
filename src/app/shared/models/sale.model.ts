import { TenderMedia } from './reconciliation-item.model';

export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface SaleCustomer {
  name: string;
  email?: string;
  phone?: string;
}

export type SaleStatus = 'completada' | 'cancelada';

export interface Sale {
  id: string;
  folio: string;
  date: string; // ISO date
  time: string; // HH:mm
  tenderMedia: TenderMedia;
  customer: SaleCustomer;
  items: SaleItem[];
  discountAmount: number;
  discountReason: string | null;
  status: SaleStatus;
}
