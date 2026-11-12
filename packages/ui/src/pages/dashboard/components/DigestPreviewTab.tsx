import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { DigestPreviewResult } from "../../../common/api-client/notifications-client";
import { ConfirmationModal } from "../../../components/common/ConfirmationModal";
import { LiveStatus } from "../../../components/common/LiveStatus";

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
  const [sending, setSending] = useState<"me" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBroadcastOpen, setConfirmBroadcastOpen] = useState(false);
  const frequencyRefs = useRef<Partial<Record<Frequency, HTMLButtonElement | null>>>({});

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
    if (scope === "all") {
      setConfirmBroadcastOpen(true);
      return;
    }
    await sendDigest(scope);
  };

  const sendDigest = async (scope: "me" | "all") => {
    setSending(scope);
    try {
      const res = await apiClient.notifications.broadcastDigest(frequency, scope);
      // Fire-and-forget: the backend returns once the run starts, before delivery.
      addNotification("success", res.message || "Digest started.");
    } catch {
      addNotification("error", "Could not start the digest (is SES configured?).");
    } finally {
      setSending(null);
    }
  };

  const onSegmentKey = (e: React.KeyboardEvent, values: Frequency[], current: Frequency) => {
    const idx = values.indexOf(current);
    let next: Frequency | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = values[(idx + 1) % values.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = values[(idx - 1 + values.length) % values.length];
    else if (e.key === "Home") next = values[0];
    else if (e.key === "End") next = values[values.length - 1];
    if (next === null) return;
    e.preventDefault();
    setFrequency(next);
    frequencyRefs.current[next]?.focus();
  };

  const busy = sending !== null;

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <div>
          <h2
            style={{
              fontSize: "var(--gw-font-size-lg)",
              margin: 0,
              color: "var(--gw-color-heading)",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            Digest preview
          </h2>
          <p style={{ marginTop: "4px", color: "var(--gw-color-text-secondary)", fontSize: "14px" }}>
            Your real {frequency} digest — the server runs the actual selection against your own
            notification preferences and the active grants, so this is exactly what you'd receive.
            Sending delivers the real email (not a test), with a working unsubscribe link.
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="gw-btn gw-btn--secondary action-button refresh-button"
            onClick={() => !busy && !loading && onSend("me")}
            aria-disabled={busy || loading || undefined}
            aria-label={`${sending === "me" ? "Sending…" : "Send to me"} — send the real ${frequency} digest to your own email`}
          >
            {sending === "me" ? "Sending…" : "Send to me"}
          </button>
          <button
            className="gw-btn gw-btn--primary action-button add-button"
            onClick={() => !busy && !loading && onSend("all")}
            aria-disabled={busy || loading || undefined}
            aria-label={`${sending === "all" ? "Sending…" : "Send to all users"} — send the real ${frequency} digest to all subscribed users`}
          >
            {sending === "all" ? "Sending…" : "Send to all users"}
          </button>
        </div>
      </div>

      <div className="digest-toolbar">
        <div
          className="gw-toggle digest-segment"
          role="radiogroup"
          aria-label="Digest frequency"
        >
          {FREQUENCIES.map(({ value, label }) => (
            <button
              key={value}
              ref={(el) => { frequencyRefs.current[value] = el; }}
              role="radio"
              aria-checked={frequency === value}
              tabIndex={frequency === value ? 0 : -1}
              className={`gw-toggle__option digest-segment__option ${frequency === value ? "is-active" : ""}`}
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
          <LiveStatus>
            <div style={{ fontSize: "18px", fontWeight: 500, marginBottom: 12 }}>{error}</div>
          </LiveStatus>
          <button className="gw-btn gw-btn--secondary action-button refresh-button" onClick={load}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="table-loading">
          <div className="table-loading-spinner" />
        </div>
      ) : rendered ? (
        <>
        <div role="status" aria-live="polite" className="visually-hidden">
          {refreshing ? `Refreshing ${frequency} digest preview` : ""}
        </div>
        <LiveStatus>
        {count === 0 && (
          <div className="digest-preview__empty-note">
            No grants currently match your notification preferences for this cadence, so no digest
            would be sent. The empty layout below is what a zero-match run renders.
          </div>
        )}
        </LiveStatus>
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
                sandbox=""
                style={{ width: "100%", height: 480, border: "none", background: "var(--gw-color-surface)" }}
              />
            </div>
            <div className="digest-preview__pane">
              <div className="digest-preview__pane-label">Plain text</div>
              <pre
                className="digest-preview__text"
                role="region"
                aria-label="Plain text digest"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region needs keyboard access (WCAG 2.1.1)
                tabIndex={0}
              >
                {rendered.text}
              </pre>
            </div>
          </div>
        </div>
        </>
      ) : null}

      <ConfirmationModal
        isOpen={confirmBroadcastOpen}
        onClose={() => setConfirmBroadcastOpen(false)}
        onConfirm={() => {
          setConfirmBroadcastOpen(false);
          void sendDigest("all");
        }}
        title="Send digest to all subscribers"
        message={
          <>
            Send the real {frequency} digest to <strong>all subscribed users</strong> now?
          </>
        }
        warning="This is not a test — each user gets a live email with a working unsubscribe link."
        confirmLabel="Send to all"
        variant="danger"
        confirming={sending === "all"}
      />
    </div>
  );
}
