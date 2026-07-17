import { useEffect, useMemo, useState } from "react";
import { Auth } from "aws-amplify";
import { useNavigate } from "react-router-dom";
import { LuCalendar } from "react-icons/lu";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import { stateNameFromCode } from "../../common/generated/states";
import { GRANT_CATEGORIES } from "../../common/types/nofo";
import type { DigestFrequency } from "../../common/api-client/notifications-client";
import type { DocumentDraft } from "../../common/api-client/drafts-client";
import type { SessionListItem } from "../../common/api-client/sessions-client";
import {
  getRecentlyViewed,
  type RecentlyViewedNOFO,
} from "../../common/helpers/recently-viewed-nofos";
import "../../styles/dashboard.css";
import "./profile.css";

const ACTIVITY_LIMIT = 5;

// Matches the link-styled title button used in the Drafts/Sessions tables.
const titleLinkStyle: React.CSSProperties = {
  color: "#195C53",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  fontSize: "14px",
  textDecoration: "underline",
};

function formatWhen(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const FREQUENCIES: { value: DigestFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
];

function toList(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

export default function ProfilePage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const {
    username,
    userState,
    roles,
    isDeveloper,
    loading: identityLoading,
  } = useAdminCheck();

  // Gated to Developers for now.
  useEffect(() => {
    if (!identityLoading && !isDeveloper) {
      navigate("/home", { replace: true });
    }
  }, [identityLoading, isDeveloper, navigate]);

  // useAdminCheck exposes cognito:username (a UUID here), not the email claim, so
  // read the email attribute directly for display.
  useEffect(() => {
    let active = true;
    Auth.currentAuthenticatedUser()
      .then((user) => {
        if (!active) return;
        const payload = user?.signInUserSession?.idToken?.payload || {};
        setEmail(String(payload.email || ""));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Recently-viewed is localStorage-backed and synchronous.
  useEffect(() => {
    setRecentNofos(getRecentlyViewed());
  }, []);

  // Drafts + chat sessions are keyed by cognito:username (the UUID from useAdminCheck).
  useEffect(() => {
    if (!username) return;
    let active = true;
    (async () => {
      try {
        const [d, s] = await Promise.all([
          apiClient.drafts.getDrafts(username, null, true),
          apiClient.sessions.getSessions(username, null, true),
        ]);
        if (!active) return;
        setDrafts(
          [...d].sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))
        );
        setSessions(
          [...s].sort((a, b) => (b.time_stamp || "").localeCompare(a.time_stamp || ""))
        );
      } catch {
        // Activity summaries are best-effort; leave them empty on failure.
      }
    })();
    return () => {
      active = false;
    };
  }, [apiClient, username]);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // "My activity" — read-only summaries linking to each item's detail page.
  const [drafts, setDrafts] = useState<DocumentDraft[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [recentNofos, setRecentNofos] = useState<RecentlyViewedNOFO[]>([]);

  // Baseline = last persisted prefs, so we can detect unsaved changes.
  const [baseline, setBaseline] = useState({
    frequency: "off" as DigestFrequency,
    categories: [] as string[],
    keywords: "",
  });
  const [frequency, setFrequency] = useState<DigestFrequency>("off");
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const prefs = await apiClient.notifications.getPrefs();
        if (!active) return;
        const loaded = {
          frequency: prefs.frequency,
          categories: prefs.categories,
          keywords: prefs.keywords.join(", "),
        };
        setBaseline(loaded);
        setFrequency(loaded.frequency);
        setCategories(loaded.categories);
        setKeywords(loaded.keywords);
      } catch {
        if (active) setError("Could not load your notification preferences.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiClient]);

  const dirty = useMemo(
    () =>
      frequency !== baseline.frequency ||
      !sameSet(categories, baseline.categories) ||
      keywords.trim() !== baseline.keywords.trim(),
    [frequency, categories, keywords, baseline]
  );

  const toggle = (list: string[], set: (v: string[]) => void, code: string) => {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
    setSaved(false);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        frequency,
        categories,
        keywords: toList(keywords),
      };
      await apiClient.notifications.updatePrefs(payload);
      setBaseline({ frequency, categories, keywords });
      setSaved(true);
    } catch {
      setError("Could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const stateLabel = userState ? stateNameFromCode(userState) || userState : "—";

  // Hold rendering until the role resolves; non-Developers are redirected above.
  if (identityLoading || !isDeveloper) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <nav aria-label="Application navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation />
      </nav>
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex" }}>
            <li className="breadcrumb-item">
              <button className="breadcrumb-link" onClick={() => navigate("/")}>
                Home
              </button>
            </li>
            <li className="breadcrumb-item" aria-current="page">
              Profile
            </li>
          </ol>
        </nav>

        <div className="dashboard-main-content">
          <div className="dashboard-header">
            <div>
              <h1>Your Profile</h1>
              <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
                Your account, notifications, and recent activity
              </p>
            </div>
          </div>

          <div className="profile-card-stack">
            <Card header="Account">
              <dl className="profile-identity">
                <dt>Email</dt>
                <dd>{email || username || "—"}</dd>
                <dt>Role</dt>
                <dd>{roles.length ? roles.join(", ") : "User"}</dd>
                <dt>State</dt>
                <dd>{stateLabel}</dd>
              </dl>
            </Card>

        <Card header="Notification preferences">
          <p className="profile-hint">
            Get an email digest of new grant opportunities that match what you care about.
            Leave every filter empty to be notified of all new opportunities.
          </p>

          {error && <div className="profile-alert profile-alert--error" role="alert">{error}</div>}
          {saved && <div className="profile-alert profile-alert--success" role="status">Preferences saved.</div>}

          {loading ? (
            <p>Loading…</p>
          ) : (
            <form onSubmit={onSave}>
              <div className="profile-section">
                <h3>Email frequency</h3>
                <div className="profile-frequency">
                  {FREQUENCIES.map((f) => (
                    <label key={f.value}>
                      <input
                        type="radio"
                        name="frequency"
                        value={f.value}
                        checked={frequency === f.value}
                        onChange={() => {
                          setFrequency(f.value);
                          setSaved(false);
                        }}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              <fieldset className="profile-fieldset" disabled={frequency === "off"}>
                <div className="profile-section">
                  <h3>State</h3>
                  <p className="profile-hint">
                    Digests cover grant opportunities for {stateLabel === "—" ? "your assigned state" : stateLabel}.
                  </p>
                </div>

                <div className="profile-section">
                  <h3>Categories</h3>
                  <div className="profile-chip-grid">
                    {GRANT_CATEGORIES.map((c) => (
                      <label key={c} className="profile-chip">
                        <input
                          type="checkbox"
                          checked={categories.includes(c)}
                          onChange={() => toggle(categories, setCategories, c)}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="profile-section">
                  <h3>Keywords</h3>
                  <label className="profile-field-label" htmlFor="profile-keywords">
                    Comma-separated
                  </label>
                  <input
                    id="profile-keywords"
                    type="text"
                    value={keywords}
                    onChange={(e) => {
                      setKeywords(e.target.value);
                      setSaved(false);
                    }}
                    placeholder="e.g. broadband, workforce"
                    style={{ width: "100%", maxWidth: 420 }}
                  />
                </div>
              </fieldset>

              <div className="profile-actions">
                <Button type="submit" loading={saving} disabled={!dirty}>
                  {dirty ? "Save preferences" : "Saved"}
                </Button>
              </div>
            </form>
          )}
        </Card>

            <ActivityTable
              title="My drafts"
              emptyText="No drafts"
              timeHeader="Last modified"
              viewAll={drafts.length > ACTIVITY_LIMIT ? {
                label: `View all ${drafts.length} drafts`,
                onClick: () => navigate("/document-editor/drafts"),
              } : undefined}
              rows={drafts.slice(0, ACTIVITY_LIMIT).map((d) => ({
                key: d.sessionId,
                title: d.title || "Untitled draft",
                when: d.lastModified,
                onOpen: () =>
                  navigate(
                    `/document-editor/${d.sessionId}?nofo=${encodeURIComponent(
                      d.documentIdentifier || ""
                    )}`
                  ),
              }))}
            />

            <ActivityTable
              title="My chat sessions"
              emptyText="No sessions"
              timeHeader="Last used"
              viewAll={sessions.length > ACTIVITY_LIMIT ? {
                label: `View all ${sessions.length} sessions`,
                onClick: () => navigate("/chat/sessions"),
              } : undefined}
              rows={sessions.slice(0, ACTIVITY_LIMIT).map((s) => ({
                key: s.session_id,
                title: s.title || "Untitled session",
                when: s.time_stamp,
                onOpen: () => navigate(`/chat/${s.session_id}`),
              }))}
            />

            <ActivityTable
              title="Recently viewed grants"
              emptyText="No recently viewed grants"
              timeHeader="Viewed"
              rows={recentNofos.slice(0, ACTIVITY_LIMIT).map((n) => ({
                key: n.value,
                title: n.label,
                when: n.lastViewed,
                onOpen: () =>
                  navigate(`/requirements/${encodeURIComponent(n.value)}`),
              }))}
            />

            <AccountActionsCard onSignedOut={() => navigate("/")} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActivityRow {
  key: string;
  title: string;
  when?: string;
  onOpen: () => void;
}

function ActivityTable({
  title,
  emptyText,
  timeHeader,
  rows,
  viewAll,
}: {
  title: string;
  emptyText: string;
  timeHeader: string;
  rows: ActivityRow[];
  viewAll?: { label: string; onClick: () => void };
}) {
  const gridCols = "2.5fr 1fr";
  return (
    <Card header={title}>
      {rows.length === 0 ? (
        <div className="no-data">
          <div style={{ fontSize: "18px", fontWeight: 500, marginBottom: "8px" }}>
            {emptyText}
          </div>
        </div>
      ) : (
        <div className="table-container" style={{ marginBottom: 0 }}>
          <div className="table-header" style={{ gridTemplateColumns: gridCols }}>
            <div className="header-cell">Title</div>
            <div className="header-cell">{timeHeader}</div>
          </div>
          <div className="table-body">
            {rows.map((r) => (
              <div key={r.key} className="table-row" style={{ gridTemplateColumns: gridCols }}>
                <div className="row-cell">
                  <button type="button" onClick={r.onOpen} style={titleLinkStyle}>
                    {r.title}
                  </button>
                </div>
                <div className="row-cell" style={{ justifyContent: "flex-end" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666" }}>
                    <LuCalendar size={16} aria-hidden="true" />
                    <time dateTime={r.when}>{formatWhen(r.when)}</time>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewAll && (
        <button
          type="button"
          className="action-button refresh-button"
          onClick={viewAll.onClick}
          style={{ alignSelf: "flex-start", marginTop: rows.length ? "12px" : 0 }}
        >
          {viewAll.label}
        </button>
      )}
    </Card>
  );
}

function AccountActionsCard({ onSignedOut }: { onSignedOut: () => void }) {
  const [showPw, setShowPw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwOk(false);
    if (newPw !== confirmPw) {
      setPwError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const user = await Auth.currentAuthenticatedUser();
      await Auth.changePassword(user, oldPw, newPw);
      setPwOk(true);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
      setShowPw(false);
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Could not change password."
      );
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await Auth.signOut({ global: true });
    } catch (err) {
      console.error("Global sign-out failed:", err);
    } finally {
      onSignedOut();
    }
  };

  return (
    <Card header="Account security">
      {pwError && <div className="profile-alert profile-alert--error" role="alert">{pwError}</div>}
      {pwOk && <div className="profile-alert profile-alert--success" role="status">Password changed.</div>}

      {showPw ? (
        <form onSubmit={changePassword}>
          <div className="profile-section">
            <label className="profile-field-label" htmlFor="pw-old">Current password</label>
            <input id="pw-old" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required style={{ width: "100%", maxWidth: 420 }} />
          </div>
          <div className="profile-section">
            <label className="profile-field-label" htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required style={{ width: "100%", maxWidth: 420 }} />
          </div>
          <div className="profile-section">
            <label className="profile-field-label" htmlFor="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required style={{ width: "100%", maxWidth: 420 }} />
          </div>
          <div className="profile-actions">
            <Button type="submit" loading={busy}>Update password</Button>
            <Button type="button" variant="ghost" onClick={() => setShowPw(false)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="profile-actions">
          <Button type="button" variant="secondary" onClick={() => setShowPw(true)}>Change password</Button>
          <Button type="button" variant="danger" onClick={signOutEverywhere} loading={busy}>Sign out of all devices</Button>
        </div>
      )}
    </Card>
  );
}
