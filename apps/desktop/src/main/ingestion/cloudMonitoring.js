/**
 * Cloud Monitoring REST client.
 *
 * Fetches live Firestore and Storage usage from Google Cloud Monitoring API.
 * Requires the service account to have roles/monitoring.viewer.
 * Gracefully throws on 403 / network errors so callers can fall back to local estimates.
 */

import { GoogleAuth } from "google-auth-library";
import fetch from "node-fetch";

const MONITORING_SCOPE = "https://www.googleapis.com/auth/monitoring.read";
const MONITORING_BASE  = "https://monitoring.googleapis.com/v3";
const REQUEST_TIMEOUT_MS = 8_000;

// Simple in-process token cache: { token: string, expiresAt: number }
let _tokenCache = null;

async function getMonitoringToken(credPath) {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token;
  }

  const auth = new GoogleAuth({
    keyFile: credPath,
    scopes: [MONITORING_SCOPE],
  });

  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  // Tokens last 60 min — cache for 55 min to avoid near-expiry races
  _tokenCache = { token, expiresAt: now + 55 * 60 * 1000 };
  return token;
}

function todayStartUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function monitoringGet(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 403) {
        throw new Error(
          `[cloudMonitoring] No monitoring.viewer role — using local estimates (HTTP 403)`
        );
      }
      throw new Error(
        `[cloudMonitoring] Cloud Monitoring HTTP ${res.status}: ${body.slice(0, 200)}`
      );
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sumTimeSeries(data) {
  let total = 0;
  for (const series of (data.timeSeries || [])) {
    for (const point of (series.points || [])) {
      const v = point.value;
      if (v?.int64Value !== undefined) {
        total += parseInt(v.int64Value, 10) || 0;
      } else if (v?.doubleValue !== undefined) {
        total += v.doubleValue || 0;
      }
    }
  }
  return total;
}

/**
 * Returns today's Firestore read and write op counts from Cloud Monitoring.
 * Note: ~4 min lag on data; returns { reads: number, writes: number }.
 */
export async function fetchFirestoreUsageToday(projectId, credPath) {
  const token = await getMonitoringToken(credPath);

  const startTime = todayStartUTC();
  const endTime   = new Date().toISOString();

  const metrics = [
    ["firestore.googleapis.com/document/read_ops_count",  "reads"],
    ["firestore.googleapis.com/document/write_ops_count", "writes"],
  ];

  const results = {};

  for (const [metricType, key] of metrics) {
    const params = new URLSearchParams({
      filter:                         `metric.type="${metricType}"`,
      "interval.startTime":           startTime,
      "interval.endTime":             endTime,
      "aggregation.alignmentPeriod":  "86400s",
      "aggregation.perSeriesAligner": "ALIGN_SUM",
    });

    const url  = `${MONITORING_BASE}/projects/${projectId}/timeSeries?${params}`;
    const data = await monitoringGet(url, token);
    results[key] = sumTimeSeries(data);
  }

  console.log(
    `[cloudMonitoring] Firestore reads today: ${results.reads}, writes today: ${results.writes}`
  );
  return { reads: results.reads, writes: results.writes };
}

/**
 * Returns the most recent total-bytes-stored value for the given GCS bucket.
 * Uses a 48-hour window because Storage metrics update slowly (≤24 h cadence).
 */
export async function fetchStorageTotalBytes(projectId, bucketName, credPath) {
  const token     = await getMonitoringToken(credPath);
  const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const endTime   = new Date().toISOString();

  const params = new URLSearchParams({
    filter:               `metric.type="storage.googleapis.com/storage/total_bytes" AND resource.labels.bucket_name="${bucketName}"`,
    "interval.startTime": startTime,
    "interval.endTime":   endTime,
  });

  const url  = `${MONITORING_BASE}/projects/${projectId}/timeSeries?${params}`;
  const data = await monitoringGet(url, token);

  // Pick the most-recent data point across all returned series
  let latestValue = 0;
  let latestTime  = "";

  for (const series of (data.timeSeries || [])) {
    for (const point of (series.points || [])) {
      const t = point.interval?.endTime || "";
      if (t > latestTime) {
        latestTime  = t;
        const v     = point.value;
        latestValue = v?.int64Value !== undefined
          ? parseInt(v.int64Value, 10) || 0
          : (v?.doubleValue || 0);
      }
    }
  }

  console.log(`[cloudMonitoring] Storage total bytes: ${latestValue}`);
  return latestValue;
}
