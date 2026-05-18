// apps/desktop/src/main/ingestion/vectorUtils.js

export function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** L2-normalize a copy of the vector (cosine sim vs raw B equals dot(normA, B)/||B|| — use dotNormalized for two unit vectors). */
export function normalizeL2(vec) {
  if (!vec?.length) return null;
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return null;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export function dotProduct(vecA, vecB) {
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
  return dot;
}

/** When `queryUnit` is L2-normalized and `rawB` is not: cos(query, B) = dot(queryUnit, rawB) / ||rawB||. One pass. */
export function cosineUnitToRaw(queryUnit, rawB) {
  if (!queryUnit || !rawB?.length || rawB.length !== queryUnit.length) return 0;
  let dot = 0;
  let normB = 0;
  for (let i = 0; i < rawB.length; i++) {
    dot += queryUnit[i] * rawB[i];
    normB += rawB[i] * rawB[i];
  }
  if (normB === 0) return 0;
  return dot / Math.sqrt(normB);
}
