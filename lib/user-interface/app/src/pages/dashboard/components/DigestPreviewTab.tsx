import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";

interface DigestPreviewTabProps {
  apiClient: ApiClient;
}

type Frequency = "daily" | "weekly";

export default function DigestPreviewTab({ apiClient }: DigestPreviewTabProps) {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (freq: Frequency) => {
      setLoading(true);
      setError(null);
      try {
        setPreview(await apiClient.notifications.getDigestPreview(freq));
      } catch {
        setError("Could not load the digest preview.");
        setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [apiClient]
  );

  useEffect(() => {
    load(frequency);
  }, [frequency, load]);

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: "var(--gw-font-size-lg)" }}>Digest preview</h1>
          <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
            How the notification digest email renders (sample data). This is the exact
            template sent to users.
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

      {loading && !preview ? (
        <div className="table-loading">
          <div className="table-loading-spinner" />
        </div>
      ) : preview ? (
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
            <strong>Subject:</strong> {preview.subject}
          </div>
          <iframe
            title="Digest preview"
            srcDoc={preview.html}
            style={{ width: "100%", height: 420, border: "none", background: "#fff" }}
          />
        </div>
      ) : null}
    </div>
  );
}
