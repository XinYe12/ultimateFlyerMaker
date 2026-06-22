// apps/desktop/src/renderer/settings/SettingsView.tsx

import { useState, useEffect, useCallback } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import SerperLearningPanel from "./SerperLearningPanel";

type KeyEntry = { key: string; label: string; description: string; url: string; isSet: boolean };

type Props = {
  onBack: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsView({ onBack }: Props) {
  const [cacheInfo, setCacheInfo] = useState<{ count: number; sizeBytes: number } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  const [requiredKeys, setRequiredKeys] = useState<KeyEntry[]>([]);
  const [optionalKeys, setOptionalKeys] = useState<KeyEntry[]>([]);
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const [rembgModel, setRembgModel] = useState<string>("border-trim");
  const [rembgSaved, setRembgSaved] = useState(false);

  const [appPaths, setAppPaths] = useState<{ userData: string; firebaseCredential: string; firebaseCredentialExists: boolean } | null>(null);

  const loadCacheInfo = useCallback(async () => {
    const info = await window.ufm.getCutoutCacheInfo();
    setCacheInfo(info);
  }, []);

  useEffect(() => {
    loadCacheInfo();
    void window.ufm.getConfig().then((cfg: { requiredKeys: KeyEntry[]; optionalKeys: KeyEntry[] }) => {
      setRequiredKeys(cfg.requiredKeys);
      setOptionalKeys(cfg.optionalKeys);
    });
    void window.ufm.getAppPaths().then(setAppPaths);
    void window.ufm.getRembgModel().then(setRembgModel);
  }, [loadCacheInfo]);

  const handleClearCache = useCallback(async () => {
    const confirmed = window.confirm(
      `Delete all ${cacheInfo?.count ?? 0} cached cutout files (${formatBytes(cacheInfo?.sizeBytes ?? 0)})?\n\nOnly do this after you have exported all current flyer jobs. Any open job in the editor will lose its product images.`
    );
    if (!confirmed) return;

    setClearing(true);
    setClearedCount(null);
    try {
      const res = await window.ufm.clearCutoutCache();
      setClearedCount(res.cleared ?? 0);
      setCacheInfo({ count: 0, sizeBytes: 0 });
    } finally {
      setClearing(false);
    }
  }, [cacheInfo]);

  const handleSaveKeys = async () => {
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(keyValues)) {
      if (v.trim()) patch[k] = v.trim();
    }
    if (Object.keys(patch).length === 0) return;
    setKeySaving(true);
    try {
      await window.ufm.saveConfig(patch);
      setKeyValues({});
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2500);
      void window.ufm.getConfig().then((cfg: { requiredKeys: KeyEntry[]; optionalKeys: KeyEntry[] }) => { setRequiredKeys(cfg.requiredKeys); setOptionalKeys(cfg.optionalKeys); });
    } finally {
      setKeySaving(false);
    }
  };

  const handleRembgModelChange = async (model: string) => {
    setRembgModel(model);
    await window.ufm.setRembgModel(model);
    setRembgSaved(true);
    setTimeout(() => setRembgSaved(false), 3000);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const,
    padding: "8px 10px", borderRadius: 6,
    border: "1.5px solid #e2e8f0", fontSize: 13,
    fontFamily: "monospace", background: "#f8fafc",
  };

  const renderKeyField = (k: KeyEntry) => (
    <div key={k.key} style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
          {k.label}
          {k.isSet && <span style={{ marginLeft: 6, fontSize: 11, color: "#22c55e", fontWeight: 400 }}>✓ Set</span>}
        </label>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 5 }}>{k.description}</div>
      <input
        type="password"
        placeholder={k.isSet ? "Leave blank to keep current value" : "Paste key here"}
        value={keyValues[k.key] ?? ""}
        onChange={e => setKeyValues(prev => ({ ...prev, [k.key]: e.target.value }))}
        style={inputStyle}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <Button variant="secondary" size="sm" onClick={onBack}>
          ← Back
        </Button>
      </div>

      <h2 style={{ margin: "0 0 24px", fontSize: "var(--text-2xl)", fontWeight: "var(--font-semibold)" }}>
        Settings
      </h2>

      {/* API Keys section */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
          API Keys
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          Keys are stored locally in your application data folder and never sent anywhere except the respective API endpoints.
        </p>

        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Required</div>
        {requiredKeys.map(renderKeyField)}

        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "16px 0 10px" }}>Optional</div>
        {optionalKeys.map(renderKeyField)}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveKeys}
            disabled={keySaving || Object.values(keyValues).every(v => !v.trim())}
          >
            {keySaving ? "Saving…" : "Save Keys"}
          </Button>
          {keySaved && <span style={{ fontSize: 13, color: "#22c55e" }}>✓ Saved</span>}
        </div>
      </Card>

      {/* Background removal model section */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
          Background Removal Model
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          Controls the first-pass AI model used to remove product backgrounds. Hard cases can automatically retry with a stronger model. Changes take effect after restarting the app.
        </p>

        {([
          {
            id: "briaai-rmbg",
            label: "briaai-rmbg",
            badge: "Experimental",
            desc: "BRIA RMBG-1.4 — light commercial-image model. Fast, but currently less stable on grocery packaging and pale/transparent products.",
          },
          {
            id: "border-trim",
            label: "border-trim",
            badge: "Recommended",
            desc: "Edge flood-fill — removes the image-border-connected background without any ML model. Fast, deterministic, works perfectly on commercial product photos (including white-on-white). Falls back to ML automatically when needed.",
          },
          {
            id: "birefnet-general",
            label: "birefnet-general",
            badge: "Maximum Quality",
            desc: "Highest quality ML model — handles complex and transparent backgrounds. Downloads ~973 MB on first use. Uses ~7 GB RAM during inference.",
          },
          {
            id: "birefnet-general-lite",
            label: "birefnet-general-lite",
            badge: "Best Quality",
            desc: "BiRefNet lite — strong quality for hard cutouts and transparent packaging. Lighter download (~300–400 MB). Higher RAM use than isnet.",
          },
          {
            id: "isnet-general-use",
            label: "isnet-general-use",
            badge: "Balanced",
            desc: "Better quality than u2net on most products (~176 MB). Good balance of quality and memory. Can struggle with fully transparent packaging.",
          },
          {
            id: "u2net",
            label: "u2net",
            badge: "Fast",
            desc: "Fastest and lowest memory (~170 MB). Good for office PCs with limited RAM. Hard cases should retry with a stronger fallback.",
          },
        ] as const).map((m) => (
          <label
            key={m.id}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              marginBottom: 12, cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="rembgModel"
              value={m.id}
              checked={rembgModel === m.id}
              onChange={() => handleRembgModelChange(m.id)}
              style={{ marginTop: 2, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                {m.label}
                {m.badge && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#6366f1", fontWeight: 400 }}>{m.badge}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{m.desc}</div>
            </div>
          </label>
        ))}

        {rembgSaved && (
          <div style={{ fontSize: 13, color: "#f59e0b", marginTop: 4 }}>
            ✓ Saved — restart the app to apply
          </div>
        )}
      </Card>

      {/* Firebase credentials section */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
          Firebase Credentials
        </h3>
        <p style={{ margin: "0 0 12px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          Required for the Product Library (database search, batch upload). Download your Firebase service account JSON from the Firebase console and place it at the path below.
        </p>
        {appPaths && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Expected location:</div>
              <code style={{ display: "block", fontSize: 11, background: "var(--color-bg-subtle)", padding: "7px 10px", borderRadius: 6, wordBreak: "break-all" as const, color: "#1e293b" }}>
                {appPaths.firebaseCredential}
              </code>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {appPaths.firebaseCredentialExists ? (
                <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>✓ Credential file found</span>
              ) : (
                <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>⚠ Not found — Product Library features disabled</span>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Search Learning section */}
      <SerperLearningPanel />

      {/* Storage section */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
          Cutout Cache
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          Every product image you process gets its background removed and saved as a PNG in{" "}
          <code style={{ fontSize: 11, background: "var(--color-bg-subtle)", padding: "1px 5px", borderRadius: 4 }}>
            apps/exports/cutouts/
          </code>
          . These files are needed while jobs are open in the editor. Once you have exported your flyers you can safely delete them to free up disk space.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            {cacheInfo === null ? (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading…</span>
            ) : cacheInfo.count === 0 ? (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Cache is empty</span>
            ) : (
              <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                {cacheInfo.count} file{cacheInfo.count !== 1 ? "s" : ""} &mdash;{" "}
                {formatBytes(cacheInfo.sizeBytes)}
              </span>
            )}
            {clearedCount !== null && (
              <span style={{ marginLeft: 12, fontSize: "var(--text-sm)", color: "var(--color-success)" }}>
                ✓ Deleted {clearedCount} file{clearedCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={handleClearCache}
            disabled={clearing || (cacheInfo?.count ?? 0) === 0}
          >
            {clearing ? "Clearing…" : "Clear Cache"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
