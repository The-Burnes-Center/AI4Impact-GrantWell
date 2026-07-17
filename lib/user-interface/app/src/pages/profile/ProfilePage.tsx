import { useEffect, useMemo, useState } from "react";
import { Auth } from "aws-amplify";
import { useNavigate } from "react-router-dom";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { stateNameFromCode } from "../../common/generated/states";
import { GRANT_CATEGORIES } from "../../common/types/nofo";
import type { DigestFrequency } from "../../common/api-client/notifications-client";
import "./profile.css";

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
  const { username, userState, roles, loading: identityLoading } = useAdminCheck();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="profile-page">
      <h1>Your profile</h1>

      <div className="profile-card-stack">
        <Card header="Account">
          {identityLoading ? (
            <p>Loading…</p>
          ) : (
            <dl className="profile-identity">
              <dt>Email</dt>
              <dd>{username || "—"}</dd>
              <dt>Role</dt>
              <dd>{roles.length ? roles.join(", ") : "User"}</dd>
              <dt>State</dt>
              <dd>{stateLabel}</dd>
            </dl>
          )}
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

        <AccountActionsCard onSignedOut={() => navigate("/")} />
      </div>
    </div>
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
