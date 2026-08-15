export interface GeoRef {
  _id: string;
  code?: string;
  name: string;
}

export interface RegionRecord {
  _id: string;
  code: string;
  name: string;
  isDeleted?: boolean;
}

export interface StateRecord {
  _id: string;
  code: string;
  name: string;
  region?: GeoRef | string;
  isDeleted?: boolean;
}

export interface MicroregionRecord {
  _id: string;
  code?: string;
  name: string;
  region?: GeoRef | string;
  state?: GeoRef | string;
  isDeleted?: boolean;
}

export interface BiomeRecord {
  _id: string;
  code: string;
  name: string;
  isDeleted?: boolean;
}

export interface YearlyValue {
  value?: number;
  year?: number;
}

export interface EndangeredPeople {
  value?: number;
  year?: number;
  riskType?: string;
}

export interface CountyStatus {
  endangeredPeople: EndangeredPeople[];
  disasterRate: YearlyValue[];
  hidroRisk: YearlyValue[];
}

export interface CountyRecord {
  _id: string;
  name: string;
  code?: string;
  IBGECode?: string;
  population?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactFunction?: string;
  location?: { lat?: number; long?: number };
  otherBiomas?: string[];
  obs?: string;
  region?: GeoRef | string;
  state?: GeoRef | string;
  microregion?: GeoRef | string;
  biome?: GeoRef | string;
  status?: CountyStatus;
}

export interface CountyEmissionRecord {
  _id: string;
  county?: string;
  actionType?: string;
  gasType?: string;
  value?: number;
  year?: number;
  sector?: string;
  category?: string;
  subCategory?: string;
  product?: string;
  detail?: string;
  activity?: string;
}

export function geoLabel(ref?: GeoRef | string | null): string {
  if (!ref) return '—';
  if (typeof ref === 'string') return ref;
  return ref.code ? `${ref.code} · ${ref.name}` : ref.name;
}

export function geoId(ref?: GeoRef | string | null): string | null {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return ref._id || null;
}
