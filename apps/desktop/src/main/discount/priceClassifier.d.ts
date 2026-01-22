export interface ClassifiedPrice {
  type: "SINGLE" | "MULTI";
  price: string;
  qty?: string;
  unit?: string;
}

export function classifyPrice(raw: string): ClassifiedPrice | null;
