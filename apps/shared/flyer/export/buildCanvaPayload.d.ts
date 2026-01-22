export function buildCanvaPayload(input: {
  items: any[];
  placements: any[];
}): {
  template_id: string;
  elements: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    image: string;
    size: string;
    department: string;
    title_en: string;
    title_zh: string;
    price: string;
  }[];
};
