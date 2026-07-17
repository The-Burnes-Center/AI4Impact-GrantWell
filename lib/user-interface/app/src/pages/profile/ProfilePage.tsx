import { useEffect, useState } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { SUPPORTED_STATES, stateNameFromCode } from "../../common/generated/states";
import type { DigestFrequency } from "../../common/api-client/notifications-client";
import "../../styles/base-page.css";

const FREQUENCIES: { value: DigestFrequency; label: string }[] = [
  { value: "off", label: "Off — no emails" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
];

function toList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const apiClient = useApiClient();
  const { username, userState, roles, loading: identityLoading } = useAdminCheck();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [frequency, setFrequency] = useState<DigestFrequency>("off");
  const [states, setStates] = useState<string[]>([]);
  const [categories, setCategories] = useState("");
  const [keywords, setKeywords] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const prefs = await apiClient.notifications.getPrefs();
        if (!active) return;
        setFrequency(prefs.frequency);
        setStates(prefs.states);
        setCategories(prefs.categories.join(", "));
        setKeywords(prefs.keywords.join(", "));
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

  const toggleState = (code: string) => {
    setStates((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.notifications.updatePrefs({
        frequency,
        states,
        categories: toList(categories),
        keywords: toList(keywords),
      });
      setSaved(true);
    } catch {
      setError("Could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const stateLabel = userState
    ? stateNameFromCode(userState) || userState
    : "—";

  return (
    <div className="base-page">
      <h1>Your profile</h1>

      <section>
        <h2>Account</h2>
        {identityLoading ? (
          <p>Loading…</p>
        ) : (
          <dl>
            <dt>Email</dt>
            <dd>{username || "—"}</dd>
            <dt>Role</dt>
            <dd>{roles.length ? roles.join(", ") : "User"}</dd>
            <dt>State</dt>
            <dd>{stateLabel}</dd>
          </dl>
        )}
      </section>

      <section>
        <h2>Notification preferences</h2>
        <p>
          Get an email digest of new grant opportunities that match what you care about.
          Leave every filter empty to be notified of all new opportunities.
        </p>

        {error && <div role="alert">{error}</div>}
        {saved && <div role="status">Preferences saved.</div>}

        {loading ? (
          <p>Loading…</p>
        ) : (
          <form onSubmit={onSave}>
            <fieldset>
              <legend>Email frequency</legend>
              {FREQUENCIES.map((f) => (
                <label key={f.value} style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="frequency"
                    value={f.value}
                    checked={frequency === f.value}
                    onChange={() => setFrequency(f.value)}
                  />{" "}
                  {f.label}
                </label>
              ))}
            </fieldset>

            <fieldset disabled={frequency === "off"}>
              <legend>States</legend>
              {SUPPORTED_STATES.map((s) => (
                <label key={s.code} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={states.includes(s.code)}
                    onChange={() => toggleState(s.code)}
                  />{" "}
                  {s.name}
                </label>
              ))}

              <label style={{ display: "block", marginTop: "1rem" }}>
                Categories (comma-separated)
                <input
                  type="text"
                  value={categories}
                  onChange={(e) => setCategories(e.target.value)}
                  placeholder="e.g. Education, Housing"
                />
              </label>

              <label style={{ display: "block", marginTop: "1rem" }}>
                Keywords (comma-separated)
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. broadband, workforce"
                />
              </label>
            </fieldset>

            <button type="submit" disabled={saving} style={{ marginTop: "1rem" }}>
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
