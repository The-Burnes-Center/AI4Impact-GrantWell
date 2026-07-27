import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { DigestPreviewResult } from "../../../common/api-client/notifications-client";

interface DigestPreviewTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

type Frequency = "daily" | "weekly";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export default function DigestPreviewTab({ apiClient, addNotification }: DigestPreviewTabProps) {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [rendered, setRendered] = useState<DigestPreviewResult["rendered"] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Which scope is mid-send (null when idle), so each button shows its own spinner.
  const [sending, setSending] = useState<"me" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Full spinner only when there's nothing to show yet; otherwise dim the stale preview.
    setError(null);
    setRendered((prev) => {
      if (prev) setRefreshing(true);
      else setLoading(true);
      return prev;
    });
    try {
      const res = await apiClient.notifications.getDigestPreview(frequency);
      setRendered(res?.rendered ?? null);
      setCount(res?.count ?? null);
    } catch {
      setError("Could not load the digest preview. The digest endpoint may not be deployed yet.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiClient, frequency]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const onSend = async (scope: "me" | "all") => {
    // The all-users send is a real broadcast to every subscribed account — guard it behind a confirm.
    if (
      scope === "all" &&
      !window.confirm(
        `Send the real ${frequency} digest to ALL subscribed users now? This is not a test — each ` +
          `user gets a live email with a working unsubscribe link.`
      )
    ) {
      return;
    }
    setSending(scope);
    try {
      const res = await apiClient.notifications.broadcastDigest(frequency, scope);
      // Fire-and-forget on the backend: it returns once the run is started, before delivery. Nothing
      // is sent to users with no matching grants — the digest run skips them.
      addNotification("success", res.message || "Digest started.");
    } catch {
      addNotification("error", "Could not start the digest (is SES configured?).");
    } finally {
      setSending(null);
    }
  };

  const onSegmentKey = (e: React.KeyboardEvent, values: Frequency[], current: Frequency) => {
    const idx = values.indexOf(current);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setFrequency(values[(idx + 1) % values.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setFrequency(values[(idx - 1 + values.length) % values.length]);
    }
  };

  const busy = sending !== null;

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: "var(--gw-font-size-lg)" }}>Digest preview</h1>
          <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
            Your real {frequency} digest — the server runs the actual selection against your own
            notification preferences and the active grants, so this is exactly what you'd receive.
            Sending delivers the real email (not a test), with a working unsubscribe link.
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="action-button refresh-button"
            onClick={() => onSend("me")}
            disabled={busy || loading}
            aria-label={`Send the real ${frequency} digest to your own email`}
          >
            {sending === "me" ? "Sending…" : "Send to me"}
          </button>
          <button
            className="action-button add-button"
            onClick={() => onSend("all")}
            disabled={busy || loading}
            aria-label={`Send the real ${frequency} digest to all subscribed users`}
          >
            {sending === "all" ? "Sending…" : "Send to all users"}
          </button>
        </div>
      </div>

      <div className="digest-toolbar">
        <div
          className="digest-segment"
          role="radiogroup"
          aria-label="Digest frequency"
        >
          {FREQUENCIES.map(({ value, label }) => (
            <button
              key={value}
              role="radio"
              aria-checked={frequency === value}
              tabIndex={frequency === value ? 0 : -1}
              className={`digest-segment__option ${frequency === value ? "is-active" : ""}`}
              onClick={() => setFrequency(value)}
              onKeyDown={(e) => onSegmentKey(e, FREQUENCIES.map((f) => f.value), frequency)}
            >
              {label}
            </button>
          ))}
        </div>

      </div>

      {error ? (
        <div className="no-data">
          <div style={{ fontSize: "18px", fontWeight: 500, marginBottom: 12 }}>{error}</div>
          <button className="action-button refresh-button" onClick={load}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="table-loading">
          <div className="table-loading-spinner" />
        </div>
      ) : rendered ? (
        <>
        {count === 0 && (
          <div className="digest-preview__empty-note" role="status">
            No grants currently match your notification preferences for this cadence, so no digest
            would be sent. The empty layout below is what a zero-match run renders.
          </div>
        )}
        <div
          className={`digest-preview ${refreshing ? "is-refreshing" : ""}`}
          aria-busy={refreshing}
        >
          {refreshing && (
            <div className="digest-preview__overlay">
              <div className="table-loading-spinner" />
            </div>
          )}
          <div className="digest-preview__subject">
            <strong>Subject:</strong> {rendered.subject}
          </div>
          <div className="digest-preview__panes">
            <div className="digest-preview__pane">
              <div className="digest-preview__pane-label">HTML</div>
              <iframe
                title={`${frequency} digest preview`}
                srcDoc={rendered.html}
                style={{ width: "100%", height: 480, border: "none", background: "#fff" }}
              />
            </div>
            <div className="digest-preview__pane">
              <div className="digest-preview__pane-label">Plain text</div>
              <pre className="digest-preview__text">{rendered.text}</pre>
            </div>
          </div>
        </div>
        </>
      ) : null}
    </div>
  );
}
