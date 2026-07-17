import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type {
  DigestConfig,
  DigestPreviewResult,
} from "../../../common/api-client/notifications-client";

interface DigestPreviewTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

type Frequency = "daily" | "weekly";

const EMPTY: DigestConfig = {
  subject: "",
  intro: "",
  footer: "",
  appName: "",
  brandColor: "",
  logoUrl: "",
};

export default function DigestPreviewTab({ apiClient, addNotification }: DigestPreviewTabProps) {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [rendered, setRendered] = useState<DigestPreviewResult["rendered"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<DigestConfig>(EMPTY);
  const [baseline, setBaseline] = useState<DigestConfig>(EMPTY);

  const dirty = (Object.keys(config) as (keyof DigestConfig)[]).some(
    (k) => config[k] !== baseline[k]
  );
  const set = (k: keyof DigestConfig, v: string) =>
    setConfig((c) => ({ ...c, [k]: v }));

  // Initial load per frequency.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.notifications.getDigestPreview(frequency);
        if (!active) return;
        setRendered(res.rendered);
        setConfig(res.config);
        setBaseline(res.config);
      } catch {
        if (active) setError("Could not load the digest preview.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  // Debounced live preview of unsaved edits.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePreview = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient.notifications.getDigestPreview(frequency, config);
        setRendered(res.rendered);
      } catch {
        /* keep last good preview */
      }
    }, 400);
  }, [apiClient, frequency, config]);

  useEffect(() => {
    if (!loading) livePreview();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, loading, livePreview]);

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await apiClient.notifications.saveDigestConfig(frequency, config);
      setBaseline(res.config);
      setRendered(res.rendered);
      addNotification("success", "Digest settings saved.");
    } catch {
      addNotification("error", "Could not save the digest settings.");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await apiClient.notifications.sendTestDigest(frequency);
      addNotification("success", res.message || "Test digest sent.");
    } catch {
      addNotification("error", "Could not send the test digest (is SES configured?).");
    } finally {
      setTesting(false);
    }
  };

  const field = (
    label: string,
    key: keyof DigestConfig,
    placeholder: string,
    multiline = false
  ) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {multiline ? (
        <textarea
          value={config[key]}
          onChange={(e) => set(key, e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ width: "100%" }}
        />
      ) : (
        <input
          type="text"
          value={config[key]}
          onChange={(e) => set(key, e.target.value)}
          placeholder={placeholder}
          style={{ width: "100%" }}
        />
      )}
    </div>
  );

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: "var(--gw-font-size-lg)" }}>Digest preview & settings</h1>
          <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
            Edit the wording and branding and see the exact email users receive (sample
            data). Leave a field blank to use the built-in default.
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className={`action-button ${frequency === "daily" ? "add-button" : "invite-button"}`}
            onClick={() => setFrequency("daily")}
          >
            Daily
          </button>
          <button
            className={`action-button ${frequency === "weekly" ? "add-button" : "invite-button"}`}
            onClick={() => setFrequency("weekly")}
          >
            Weekly
          </button>
        </div>
      </div>

      {error && (
        <div className="no-data">
          <div style={{ fontSize: "18px", fontWeight: 500 }}>{error}</div>
        </div>
      )}

      {loading ? (
        <div className="table-loading">
          <div className="table-loading-spinner" />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) 1.4fr", gap: 24 }}>
          {/* Editor */}
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Copy</h3>
            {field("Subject line", "subject", "Default: N new grant opportunities — your daily digest")}
            {field("Intro text", "intro", "Default: Here are N new grant opportunities…", true)}
            {field("Footer text", "footer", "Default: You're receiving this because…", true)}

            <h3 style={{ margin: "16px 0 8px" }}>Branding</h3>
            {field("App name", "appName", "e.g. GrantWell")}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Brand color
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(config.brandColor) ? config.brandColor : "#195C53"}
                  onChange={(e) => set("brandColor", e.target.value)}
                  style={{ width: 44, height: 32, padding: 0, border: "none", background: "none" }}
                  aria-label="Brand color"
                />
                <input
                  type="text"
                  value={config.brandColor}
                  onChange={(e) => set("brandColor", e.target.value)}
                  placeholder="#195C53"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            {field("Logo URL", "logoUrl", "https://…/logo.png")}

            <div className="dashboard-actions" style={{ marginTop: 8 }}>
              <button className="action-button add-button" onClick={onSave} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                className="action-button refresh-button"
                onClick={() => setConfig(baseline)}
                disabled={!dirty || saving}
              >
                Reset
              </button>
              <button
                className="action-button invite-button"
                onClick={onTest}
                disabled={testing}
                title="Sends the sample digest to your own email"
              >
                {testing ? "Sending…" : "Send test to me"}
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div
            className="table-container"
            style={{ marginBottom: 40, padding: 0, overflow: "hidden" }}
          >
            <div
              style={{
                padding: "12px 16px",
                background: "#f5f8fc",
                borderBottom: "1px solid #e0e0e0",
                fontSize: "14px",
              }}
            >
              <strong>Subject:</strong> {rendered?.subject}
            </div>
            <iframe
              title="Digest preview"
              srcDoc={rendered?.html || ""}
              style={{ width: "100%", height: 480, border: "none", background: "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
