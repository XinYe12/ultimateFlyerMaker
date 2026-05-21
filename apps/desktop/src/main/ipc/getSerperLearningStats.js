// apps/desktop/src/main/ipc/getSerperLearningStats.js

import { db } from "../ingestion/firebase.js";

const SIGNALS_COLLECTION = "serper_signals";
const WEIGHTS_DOC_PATH   = "serper_learning/domain_weights";

export async function getSerperLearningStats() {
  const [signalsSnap, weightsSnap] = await Promise.all([
    db.collection(SIGNALS_COLLECTION).orderBy("timestamp", "desc").limit(200).get(),
    db.doc(WEIGHTS_DOC_PATH).get(),
  ]);

  const docs = signalsSnap.docs.map(d => d.data());
  const totalSignals = docs.length;

  const serperRuns = docs.filter(d => d.finalSource === "serper");
  const dbFirstCount = docs.filter(d => d.finalSource === "db").length;

  // Last 20 Serper runs, oldest first for the sparkline
  const recentSerperRuns = serperRuns.slice(0, 20).reverse();
  const recentRanks = recentSerperRuns.map(d =>
    d.acceptedRank != null ? d.acceptedRank : -1
  );

  const firstPickCount = recentRanks.filter(r => r === 0).length;
  const firstPickRate = recentRanks.length > 0
    ? Math.round((firstPickCount / recentRanks.length) * 100)
    : 0;

  // Build top domains from domain_weights
  const topDomains = [];
  if (weightsSnap.exists) {
    const weights = weightsSnap.data() ?? {};
    for (const [domain, cats] of Object.entries(weights)) {
      const all = cats["_all"] ?? {};
      const a = all.a ?? 0;
      const r = all.r ?? 0;
      const total = a + r;
      if (total >= 5) {
        topDomains.push({ domain, acceptRate: Math.round((a / total) * 100), total });
      }
    }
    topDomains.sort((a, b) => b.acceptRate - a.acceptRate);
    topDomains.splice(5); // keep top 5
  }

  return {
    totalSignals,
    serperRunCount: serperRuns.length,
    dbFirstCount,
    recentRanks,
    firstPickRate,
    topDomains,
  };
}
