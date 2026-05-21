// apps/desktop/src/main/ingestion/serperSignalService.js
// Fire-and-forget Firestore writes for the Serper learning feedback loop.
// All functions catch their own errors and never throw.

import { db } from "./firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { getDomain } from "./braveSearchService.js";

const SIGNALS_COLLECTION = "serper_signals";
const WEIGHTS_DOC_PATH   = "serper_learning/domain_weights";

/**
 * Record a full Serper run outcome (all results + which was accepted).
 * Write-only — never queried by the app; used as offline audit log.
 */
export async function recordSerperSignal(signalDoc) {
  try {
    await db.collection(SIGNALS_COLLECTION).add(signalDoc);
  } catch (err) {
    console.warn("[serperSignalService] recordSerperSignal failed:", err.message);
  }
}

/**
 * Record a user-triggered rejection (image swapped out in editor).
 * Writes a minimal rejection doc and increments the domain's rejection count.
 */
export async function recordSerperRejection({ url, domain, productEn, department, reason }) {
  try {
    await db.collection(SIGNALS_COLLECTION).add({
      timestamp: Date.now(),
      productEn: productEn || "",
      department: department || "",
      url: url || "",
      domain: domain || "",
      reason: reason || "rejected_user_swap",
      finalSource: "swapped",
    });
  } catch (err) {
    console.warn("[serperSignalService] recordSerperRejection write failed:", err.message);
  }
  if (domain) {
    await updateDomainWeights(domain, department || "_all", "rejected");
  }
}

/**
 * Atomically increment the accepted (a) or rejected (r) count for a domain+category.
 */
export async function updateDomainWeights(domain, category, outcome) {
  if (!domain) return;
  const field  = outcome === "accepted" ? "a" : "r";
  const catKey = category || "_all";
  try {
    await db.doc(WEIGHTS_DOC_PATH).set(
      { [domain]: { [catKey]: { [field]: FieldValue.increment(1) } } },
      { merge: true }
    );
  } catch (err) {
    console.warn("[serperSignalService] updateDomainWeights failed:", err.message);
  }
}

/**
 * Record a manual Chrome search acceptance — the user deliberately found and picked this image.
 * Counts as 3× a passive Serper acceptance because it represents explicit user intent.
 */
export async function recordManualGoogleAccepted({ sourceUrl, searchQuery, productEn, department }) {
  const domain = getDomain(sourceUrl);
  await recordSerperSignal({
    source: "manual_google_search",
    query: searchQuery || "",
    productEn: productEn || "",
    department: department || "",
    timestamp: Date.now(),
    acceptedDomain: domain,
    finalSource: "manual_google",
  });
  // 3× weight: deliberate user intent outweighs passive acceptance
  for (let i = 0; i < 3; i++) {
    await updateDomainWeights(domain, department || "_all", "accepted");
  }
}

/**
 * Load the domain weight map from Firestore.
 * Returns {} on any error so the scorer falls back to static scoring.
 */
export async function loadDomainWeights() {
  try {
    const snap = await db.doc(WEIGHTS_DOC_PATH).get();
    return snap.exists ? (snap.data() ?? {}) : {};
  } catch (err) {
    console.warn("[serperSignalService] loadDomainWeights failed:", err.message);
    return {};
  }
}
