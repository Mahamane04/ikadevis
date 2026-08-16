/**
 * ikadevis / Micro Office ERP Calcul — Définitions TypeScript Strictes (V6.0)
 * BTP Price Study, Takeoff Calculation, CRM, Projects and Financial Engine
 */

export type UserRole = 'owner' | 'admin' | 'estimator' | 'commercial' | 'viewer';

export type QuoteStatus = 
  | 'draft' 
  | 'in_review' 
  | 'approved' 
  | 'sent' 
  | 'viewed' 
  | 'accepted' 
  | 'rejected' 
  | 'expired' 
  | 'cancelled' 
  | 'archived';

export type TakeoffMode = 
  | 'rectangle' 
  | 'surface' 
  | 'volume' 
  | 'linear' 
  | 'floor' 
  | 'unit';

export type BTPUnit = 
  | 'mm' | 'cm' | 'm' | 'm²' | 'm³' | 'ml' 
  | 'kg' | 'g' | 'L' | 'ml_liquid' | 'u' 
  | 'h' | 'j' | 'forfait' | 'barre' | 'plaque' 
  | 'rouleau' | 'carton' | 'sac' | 'pot';

export interface Organization {
  id: string;
  name: string;
  currency: string;
  role: UserRole;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Client {
  id: string;
  name: string;
  contactPerson?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName?: string;
  siteAddress?: string;
  city?: string;
  status: 'prospect' | 'active' | 'in_progress' | 'completed' | 'cancelled';
  budgetEstimated: number;
  createdAt: string;
}

export interface Material {
  id: number;
  reference?: string;
  name: string;
  category: string;
  subCategory?: string;
  brand?: string;
  supplier?: string;
  stock?: number;
  unitBuy: string;
  unitSize: number;
  unitCalc: string;
  priceBuy: number;
  priceCalc: number;
  waste: number;
  yieldRate: number;
  purchaseMode: 'pack' | 'real';
}

export interface Labor {
  id: number;
  name: string;
  category: string;
  baseHourlyRate: number;
  burdenRate: number;
  realHourlyCost: number;
  dailyRate: number;
  billedHourlyRate: number;
}

export interface Equipment {
  id: number;
  name: string;
  category: string;
  hourlyCost: number;
  dailyCost: number;
  transportCost: number;
  fuelConsumption: number;
}

export interface Subcontractor {
  id: number;
  name: string;
  trade: string;
  phone?: string;
  defaultMarkup: number;
}

export interface Solution {
  id: number;
  name: string;
  icon: string;
  allowedModes: TakeoffMode[];
  customVars?: Array<{
    name: string;
    label: string;
    defaultValue: number;
    unit: string;
  }>;
}

export interface Recipe {
  id: number;
  solutionId: number;
  type: 'material' | 'labor' | 'equipment' | 'subcontractor';
  refId: number | string;
  formula: string;
  costCategory: string;
  label: string;
}

export interface CommercialItem {
  name: string;
  billedQty: number;
  unit: string;
  sellingUnitHT: number;
  sellingTotalHT: number;
}

export interface PaymentMilestone {
  stage: string;
  percentage: number;
  amountTTC: number;
}

export interface FinancialTotals {
  totalDebourseConsomme: number;
  fraisGenerauxConsomme: number;
  totalRevientConsomme: number;
  netHTConsomme: number;
  tvaConsomme: number;
  totalTTCConsomme: number;
  margeValeurConsomme: number;
  margePctConsommeReelle: number;
  salesMultiplierK: number;
  isLossMaking: boolean;
  paymentSchedule: PaymentMilestone[];
  commercialItems: CommercialItem[];
}

export interface Quote {
  id: string | number;
  number: string;
  versionNumber?: number;
  parentQuoteId?: string | number | null;
  clientId?: string;
  clientName: string;
  projectId?: string;
  projectRef: string;
  date: string;
  status: QuoteStatus;
  vatRate: number;
  quoteData: FinancialTotals;
  companyInfoSnapshot?: {
    name: string;
    currency: string;
    taxId?: string;
    phone?: string;
    email?: string;
    address?: string;
    paymentTerms: string;
    quoteValidity: string;
  };
  signedAt?: string | null;
  signedByName?: string | null;
  signatureData?: string | null;
  shareToken?: string | null;
}
