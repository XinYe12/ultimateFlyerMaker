// apps/desktop/src/renderer/settings/SetupView.tsx
// First-run screen shown when required API keys are not yet configured.

import { useState, useEffect } from "react";

type KeyEntry = {
  key: string;
  label: string;
  description: string;
  url: string;
  isSet: boolean;
};

type Props = {
  onComplete: () => void;
};

export default function SetupView({ onComplete }: Props) {
  const [requiredKeys, setRequiredKeys] = useState<KeyEntry[]>([]);
  const [optionalKeys, setOptionalKeys] = useState<KeyEntry[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.ufm.getConfig().then((cfg: { requiredKeys: KeyEntry[]; optionalKeys: KeyEntry[] }) => {
      setRequiredKeys(cfg.requiredKeys);
      setOptionalKeys(cfg.optionalKeys);
    });
  }, []);

  const handleSave = async () => {
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) patch[k] = v.trim();
    }

    setSaving(true);
    setError(null);
    try {
      const res = await window.ufm.saveConfig(patch);
      if (res.missingKeys.length > 0) {
        setError(`Still missing: ${res.missingKeys.join(", ")}`);
      } else {
        onComplete();
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const allRequiredFilled = requiredKeys.every(k => k.isSet || values[k.key]?.trim());

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", borderRadius: 8,
    border: "1.5px solid #e2e8f0", fontSize: 13,
    fontFamily: "monospace", outline: "none",
    background: "#f8fafc",
  };

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "var(--color-bg, #f8fafc)",
    }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
            Welcome to Ultimate Flyer Maker
          </div>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
            Enter your API keys to get started. These are stored locally on your machine.
          </div>
        </div>

        {/* Required keys */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Required
          </div>
          {requiredKeys.map(k => (
            <div key={k.key} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{k.label}</label>
                <a
                  href={k.url}
                  onClick={e => { e.preventDefault(); (window as any).ufm?.openExternal?.(k.url); }}
                  style={{ fontSize: 11, color: "#4C6EF5", textDecoration: "none" }}
                >
                  Get key ↗
                </a>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{k.description}</div>
              <input
                type="password"
                placeholder={k.isSet ? "Already set — leave blank to keep" : "sk-..."}
                value={values[k.key] ?? ""}
                onChange={e => setValues(prev => ({ ...prev, [k.key]: e.target.value }))}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        {/* Optional keys */}
        {optionalKeys.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              Optional
            </div>
            {optionalKeys.map(k => (
              <div key={k.key} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{k.label}</label>
                  <a
                    href={k.url}
                    onClick={e => { e.preventDefault(); (window as any).ufm?.openExternal?.(k.url); }}
                    style={{ fontSize: 11, color: "#4C6EF5", textDecoration: "none" }}
                  >
                    Get key ↗
                  </a>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{k.description}</div>
                <input
                  type="password"
                  placeholder={k.isSet ? "Already set — leave blank to keep" : "Optional"}
                  value={values[k.key] ?? ""}
                  onChange={e => setValues(prev => ({ ...prev, [k.key]: e.target.value }))}
                  style={inputStyle}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, color: "#DC2626" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !allRequiredFilled}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
            background: allRequiredFilled ? "#4C6EF5" : "#e2e8f0",
            color: allRequiredFilled ? "#fff" : "#94a3b8",
            fontSize: 15, fontWeight: 700, cursor: allRequiredFilled ? "pointer" : "default",
            transition: "background 150ms",
          }}
        >
          {saving ? "Saving…" : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
