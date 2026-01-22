// apps/desktop/src/main/ingestion/validateResult.js

export function validateResult(result) {
  if (!result || typeof result !== "object") return false;

  const hasAnyCoreField =
    Boolean(result.english_name) ||
    Boolean(result.chinese_name) ||
    Boolean(result.sale_price);

  if (!hasAnyCoreField) return false;

  return true;
}
