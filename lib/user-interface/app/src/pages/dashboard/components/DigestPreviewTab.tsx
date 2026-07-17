import { useEffect, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { DigestPreviewResult } from "../../../common/api-client/notifications-client";

interface DigestPreviewTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

type Frequency = "daily" | "weekly";

export default function DigestPreviewTab({ apiClient, addNotification }: DigestPreviewTabProps) {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [rendered, setRendered] = useState<DigestPreviewResult["rendered"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.notifications.getDigestPreview(frequency);
        if (!active) return;
        setRendered(res?.rendered ?? null);
      } catch {
        if (active) {
          setError("Could not load the digest preview. The digest endpoint may not be deployed yet.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiClient, frequency]);

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

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: "var(--gw-font-size-lg)" }}>Digest preview</h1>
          <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
            The exact notification email users receive (sample data). Copy and branding are
            pulled from the GrantWell configuration.
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
          <button
            className="action-button refresh-button"
            onClick={onTest}
            disabled={testing || loading}
            title="Sends the sample digest to your own email"
          >
            {testing ? "Sending…" : "Send test to me"}
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
      ) : rendered ? (
        <div
          className="table-container"
          style={{ marginBottom: 40, padding: 0, overflow: "hidden", maxWidth: 700 }}
        >
          <div
            style={{
              padding: "12px 16px",
              background: "#f5f8fc",
              borderBottom: "1px solid #e0e0e0",
              fontSize: "14px",
            }}
          >
            <strong>Subject:</strong> {rendered.subject}
          </div>
          <iframe
            title="Digest preview"
            srcDoc={rendered.html}
            style={{ width: "100%", height: 480, border: "none", background: "#fff" }}
          />
        </div>
      ) : null}
    </div>
  );
}
