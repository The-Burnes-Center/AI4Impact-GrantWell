import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAuthSession,
  fetchMFAPreference,
  signOut,
  updateMFAPreference,
  updatePassword,
} from "aws-amplify/auth";
import { useNavigate } from "react-router";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import { useNavigationChrome } from "../../components/navigation/navigation-context";
import { ConfirmationModal } from "../../components/common/ConfirmationModal";
import MfaSetupPanel from "../../components/auth/MfaSetupPanel";
import { LiveStatus } from "../../components/common/LiveStatus";
import PasswordRequirementsList from "../../components/auth/PasswordRequirementsList";
import { getPasswordRequirements } from "../../components/auth/auth-utils";
import { clearMfaPromptSnooze } from "../../common/mfa-snooze";
import { EMAIL_DIGEST, MFA_DEADLINE_ISO, MFA_ENABLED, MFA_REQUIRED, REGIONS } from "../../common/instance";
import { deadlineDateText, mfaDeadlinePhase } from "../../common/mfa-deadline";
import PageHeader from "../../components/common/PageHeader";
import { SINGLE_STATE, stateNameFromCode } from "../../common/states";
import { roleLabel } from "../../common/helpers/auth-roles";
import { GRANT_CATEGORIES } from "../../common/types/nofo";
import type { DigestFrequency } from "../../common/api-client/notifications-client";
import { PROFILE_FIELD_MAX_LENGTH } from "../../common/api-client/user-profile-client";
import "../../styles/dashboard.css";
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
  const {
    username,
    userState,
    roles,
    loading: identityLoading,
  } = useAdminCheck();

  // useAdminCheck exposes cognito:username (a UUID here), not the email claim, so
  // read the email attribute directly for display.
  useEffect(() => {
    let active = true;
    fetchAuthSession()
      .then((session) => {
        if (!active) return;
        const payload = session.tokens?.idToken?.payload ?? {};
        setEmail(String(payload.email || ""));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Organization details (agency / org / title) — same fields as the profile-completion gate.
  const [orgAgency, setOrgAgency] = useState("");
  const [orgOrganization, setOrgOrganization] = useState("");
  const [orgJobTitle, setOrgJobTitle] = useState("");
  const [orgRegion, setOrgRegion] = useState("");
  const [orgBaseline, setOrgBaseline] = useState({ agency: "", organization: "", jobTitle: "", region: "" });
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgMissing, setOrgMissing] = useState<string[]>([]);
  const [orgSaved, setOrgSaved] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.userProfile
      .getProfile()
      .then((p) => {
        if (!active) return;
        setOrgAgency(p.agency || "");
        setOrgOrganization(p.organization || "");
        setOrgJobTitle(p.jobTitle || "");
        const region = REGIONS.includes(p.region) ? p.region : "";
        setOrgRegion(region);
        setOrgBaseline({
          agency: p.agency || "",
          organization: p.organization || "",
          jobTitle: p.jobTitle || "",
          region,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [apiClient]);

  const orgDirty =
    orgAgency.trim() !== orgBaseline.agency.trim() ||
    orgOrganization.trim() !== orgBaseline.organization.trim() ||
    orgJobTitle.trim() !== orgBaseline.jobTitle.trim() ||
    orgRegion !== orgBaseline.region;

  const onSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgDirty) return;
    const missing = [
      !orgAgency.trim() && "profile-agency",
      !orgOrganization.trim() && "profile-org",
      !orgJobTitle.trim() && "profile-title",
      REGIONS.length > 0 && !orgRegion && "profile-region",
    ].filter((id): id is string => Boolean(id));
    setOrgMissing(missing);
    if (missing.length) {
      setOrgError("Fill in the fields marked below.");
      document.getElementById(missing[0])?.focus();
      return;
    }
    setOrgSaving(true);
    setOrgError(null);
    setOrgSaved(false);
    try {
      await apiClient.userProfile.updateProfile({
        agency: orgAgency.trim(),
        organization: orgOrganization.trim(),
        jobTitle: orgJobTitle.trim(),
        ...(REGIONS.length && { region: orgRegion }),
      });
      setOrgBaseline({
        agency: orgAgency.trim(),
        organization: orgOrganization.trim(),
        jobTitle: orgJobTitle.trim(),
        region: orgRegion,
      });
      setOrgSaved(true);
    } catch {
      setOrgError("Could not save your organization details.");
    } finally {
      setOrgSaving(false);
    }
  };

  // Baseline = last persisted prefs, so we can detect unsaved changes.
  const [baseline, setBaseline] = useState({
    frequency: "off" as DigestFrequency,
    categories: [] as string[],
    keywords: "",
  });
  const [frequency, setFrequency] = useState<DigestFrequency>("off");
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [grantCategories, setGrantCategories] = useState<string[] | null>(null);

  useEffect(() => {
    if (!EMAIL_DIGEST) return;
    let active = true;
    apiClient.landingPage
      .getNOFOs()
      .then((result: { nofoData?: { category?: string | null }[] }) => {
        if (!active) return;
        setGrantCategories([...new Set((result?.nofoData ?? []).map((n) => n.category).filter((c): c is string => !!c))]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [apiClient]);

  // Categories that have grants, plus any already chosen so a saved choice never disappears.
  const offeredCategories = useMemo<string[]>(() => {
    if (!grantCategories) return [...GRANT_CATEGORIES];
    const used = new Set([...grantCategories, ...baseline.categories]);
    const known = GRANT_CATEGORIES.filter((c) => used.has(c));
    const extra = [...used].filter((c) => !(GRANT_CATEGORIES as readonly string[]).includes(c)).sort();
    return [...known, ...extra];
  }, [grantCategories, baseline.categories]);

  useEffect(() => {
    if (!EMAIL_DIGEST) return;
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

  const unsaved = orgDirty || dirty;
  const setLeaveGuard = useNavigationChrome()?.setLeaveGuard;
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!unsaved || !setLeaveGuard) return;
    setLeaveGuard((proceed) => setPendingLeave(() => proceed));
    return () => setLeaveGuard(null);
  }, [unsaved, setLeaveGuard]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const toggle = (list: string[], set: (v: string[]) => void, code: string) => {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
    setSaved(false);
  };

  const visibleCategories = useMemo<string[]>(() => {
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return offeredCategories;
    return offeredCategories.filter((c) => c.toLowerCase().includes(q));
  }, [categoryQuery, offeredCategories]);

  const allVisibleSelected =
    visibleCategories.length > 0 &&
    visibleCategories.every((c) => categories.includes(c));
  const someVisibleSelected = visibleCategories.some((c) =>
    categories.includes(c)
  );

  // Bulk actions apply to the filtered set only, so they never silently touch
  // selections the user can't currently see.
  const setVisibleSelected = (selected: boolean) => {
    setCategories(
      selected
        ? Array.from(new Set([...categories, ...visibleCategories]))
        : categories.filter((c) => !visibleCategories.includes(c))
    );
    setSaved(false);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
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

  const shownState = SINGLE_STATE?.code || userState;
  const stateLabel = shownState ? stateNameFromCode(shownState) || shownState : "Not assigned";

  // Hold rendering until identity (email, state, roles) resolves.
  if (identityLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <UnifiedNavigation />
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="dashboard-main-content">
          <PageHeader
            title="Profile"
            intro={
              EMAIL_DIGEST
                ? "Your account, sign-in security, and notification preferences"
                : "Your account and sign-in security"
            }
          />

          <nav className="profile-jump-links" aria-label="Profile sections">
            <a href="#profile-account">Account</a>
            <a href="#profile-security">Sign-in &amp; security</a>
            {EMAIL_DIGEST && <a href="#profile-notifications">Notifications</a>}
          </nav>

          <div className="profile-card-stack">
            <div id="profile-account" className="profile-anchor">
              <Card header="Account" headerStyle="default">
                <dl className="profile-identity profile-section">
                  <dt>Email</dt>
                  <dd>{email || username || "—"}</dd>
                  <dt>Access level</dt>
                  <dd>{roles.length ? roles.map(roleLabel).join(", ") : "User"}</dd>
                  <dt>State</dt>
                  <dd>{stateLabel}</dd>
                </dl>

                <h3 className="profile-subheading">Organization details</h3>
                <p className="profile-hint">
                  Your department, organization, {REGIONS.length > 0 ? "role, and region" : "and role"}. Used to understand who&apos;s
                  using GrantWell.
                </p>
                {orgError && (
                  <div className="gw-alert gw-alert--urgent profile-alert profile-alert--error" role="alert">
                    {orgError}
                  </div>
                )}
                <LiveStatus>
                  {orgSaved && (
                    <div className="gw-alert gw-alert--success profile-alert profile-alert--success">
                      Organization details saved.
                    </div>
                  )}
                </LiveStatus>
                <form onSubmit={onSaveOrg}>
                  <div className="profile-section">
                    <label className="profile-field-label" htmlFor="profile-agency">
                      Department
                      <span className="gw-field__required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="profile-agency"
                      aria-required="true"
                      aria-invalid={orgMissing.includes("profile-agency") || undefined}
                      aria-describedby={orgMissing.includes("profile-agency") ? "profile-agency-error" : undefined}
                      type="text"
                      value={orgAgency}
                      onChange={(e) => {
                        setOrgAgency(e.target.value);
                        setOrgMissing((m) => m.filter((id) => id !== "profile-agency"));
                        setOrgSaved(false);
                      }}
                      className="gw-input profile-input"
                      placeholder="e.g. Department of Transportation"
                      maxLength={PROFILE_FIELD_MAX_LENGTH}
                    />
                    {orgMissing.includes("profile-agency") && (
                      <p id="profile-agency-error" className="gw-field__message">Enter your department</p>
                    )}
                  </div>
                  <div className="profile-section">
                    <label className="profile-field-label" htmlFor="profile-org">
                      Organization
                      <span className="gw-field__required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="profile-org"
                      aria-required="true"
                      aria-invalid={orgMissing.includes("profile-org") || undefined}
                      aria-describedby={orgMissing.includes("profile-org") ? "profile-org-error" : undefined}
                      type="text"
                      autoComplete="organization"
                      value={orgOrganization}
                      onChange={(e) => {
                        setOrgOrganization(e.target.value);
                        setOrgMissing((m) => m.filter((id) => id !== "profile-org"));
                        setOrgSaved(false);
                      }}
                      className="gw-input profile-input"
                      placeholder="e.g. Planning Division"
                      maxLength={PROFILE_FIELD_MAX_LENGTH}
                    />
                    {orgMissing.includes("profile-org") && (
                      <p id="profile-org-error" className="gw-field__message">Enter your organization</p>
                    )}
                  </div>
                  <div className="profile-section">
                    <label className="profile-field-label" htmlFor="profile-title">
                      Role / Title
                      <span className="gw-field__required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="profile-title"
                      aria-required="true"
                      aria-invalid={orgMissing.includes("profile-title") || undefined}
                      aria-describedby={orgMissing.includes("profile-title") ? "profile-title-error" : undefined}
                      type="text"
                      autoComplete="organization-title"
                      value={orgJobTitle}
                      onChange={(e) => {
                        setOrgJobTitle(e.target.value);
                        setOrgMissing((m) => m.filter((id) => id !== "profile-title"));
                        setOrgSaved(false);
                      }}
                      className="gw-input profile-input"
                      placeholder="e.g. Grants Manager"
                      maxLength={PROFILE_FIELD_MAX_LENGTH}
                    />
                    {orgMissing.includes("profile-title") && (
                      <p id="profile-title-error" className="gw-field__message">Enter your role or title</p>
                    )}
                  </div>
                  {REGIONS.length > 0 && (
                    <div className="profile-section">
                      <label className="profile-field-label" htmlFor="profile-region">
                        Region
                        <span className="gw-field__required" aria-hidden="true">*</span>
                      </label>
                      <select
                        id="profile-region"
                        aria-required="true"
                        aria-invalid={orgMissing.includes("profile-region") || undefined}
                        aria-describedby={orgMissing.includes("profile-region") ? "profile-region-error" : undefined}
                        value={orgRegion}
                        onChange={(e) => {
                          setOrgRegion(e.target.value);
                        setOrgMissing((m) => m.filter((id) => id !== "profile-region"));
                          setOrgSaved(false);
                        }}
                        className="gw-input profile-input"
                      >
                        <option value="">Select a region</option>
                        {REGIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {orgMissing.includes("profile-region") && (
                        <p id="profile-region-error" className="gw-field__message">Choose your region</p>
                      )}
                    </div>
                  )}
                  <div className="profile-actions">
                    <Button type="submit" loading={orgSaving} aria-disabled={!orgDirty || undefined}>
                      Save changes
                    </Button>
                  </div>
                </form>
              </Card>
            </div>

            <div id="profile-security" className="profile-anchor">
              <AccountActionsCard onSignedOut={() => navigate("/")} />
            </div>

            {EMAIL_DIGEST && (
              <div id="profile-notifications" className="profile-anchor">
                <Card header="Notification preferences" headerStyle="default">
                  <p className="profile-hint">
                    Get an email digest of new grants that match what you care about.
                    Leave every filter empty to be notified of all new grants.
                  </p>

                  {error && <div className="gw-alert gw-alert--urgent profile-alert profile-alert--error" role="alert">{error}</div>}
                  <LiveStatus>
                    {saved && <div className="gw-alert gw-alert--success profile-alert profile-alert--success">Preferences saved.</div>}
                  </LiveStatus>

                  {loading ? (
                    <p role="status">Loading…</p>
                  ) : (
                    <form onSubmit={onSave}>
                      <fieldset className="profile-section profile-fieldset">
                        <legend className="profile-legend"><h3>Email frequency</h3></legend>
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
                      </fieldset>

                      <fieldset className="profile-fieldset" disabled={frequency === "off"}>
                        <div className="profile-section">
                          <h3>State</h3>
                          <p className="profile-hint">
                            Digests cover grants for {userState ? stateLabel : "your state"}.
                          </p>
                        </div>

                        <fieldset className="profile-section profile-fieldset">
                          <legend className="profile-legend"><h3>Categories</h3></legend>
                          <div className="profile-chip-toolbar">
                            <input
                              type="search"
                              className="gw-input profile-chip-search"
                              value={categoryQuery}
                              onChange={(e) => setCategoryQuery(e.target.value)}
                              placeholder="Search categories"
                              aria-label="Search categories"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => !allVisibleSelected && setVisibleSelected(true)}
                              aria-disabled={allVisibleSelected || undefined}
                            >
                              {categoryQuery.trim()
                                ? `Select all ${visibleCategories.length} shown`
                                : "Select all"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => someVisibleSelected && setVisibleSelected(false)}
                              aria-disabled={!someVisibleSelected || undefined}
                            >
                              Clear
                            </Button>
                            {/* Not a live region: each checkbox already announces its own
                                state, and this count would talk over that. */}
                            <span className="profile-chip-count">
                              {categories.length} of {offeredCategories.length} selected
                            </span>
                          </div>
                          {visibleCategories.length === 0 ? (
                            <p className="profile-hint">
                              No categories match “{categoryQuery.trim()}”.
                            </p>
                          ) : (
                            <div className="profile-chip-grid">
                              {visibleCategories.map((c) => (
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
                          )}
                        </fieldset>

                        <div className="profile-section">
                          <h3>Keywords</h3>
                          <label className="profile-field-label" htmlFor="profile-keywords">
                            Keywords (comma-separated)
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
                            className="gw-input profile-input"
                          />
                        </div>
                      </fieldset>

                      <div className="profile-actions">
                        <Button type="submit" loading={saving} aria-disabled={!dirty || undefined}>
                          Save preferences
                        </Button>
                      </div>
                    </form>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={pendingLeave !== null}
        title="Leave without saving?"
        message="You have changes on this page that aren't saved yet."
        confirmLabel="Leave without saving"
        cancelLabel="Stay on this page"
        onConfirm={() => {
          const proceed = pendingLeave;
          setPendingLeave(null);
          proceed?.();
        }}
        onClose={() => setPendingLeave(null)}
      />
    </div>
  );
}

function MfaSection() {
  const [status, setStatus] = useState<"loading" | "on" | "off">("loading");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After turning it on or off, or cancelling setup, the control that had focus is gone: move it to the new state.
  const hint = useRef<HTMLParagraphElement>(null);
  const [focusHint, setFocusHint] = useState(false);
  useEffect(() => {
    if (!focusHint) return;
    hint.current?.focus();
    setFocusHint(false);
  }, [focusHint]);

  const load = async () => {
    try {
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload ?? {};
      setEmail(typeof claims.email === "string" ? claims.email : "");
      setUserId(typeof claims.sub === "string" ? claims.sub : "");
      const pref = await fetchMFAPreference();
      setStatus(pref.enabled?.includes("TOTP") || pref.preferred === "TOTP" ? "on" : "off");
    } catch (err) {
      console.error("Could not read MFA preference", err);
      setStatus("off");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateMFAPreference({ totp: "DISABLED" });
      setStatus("off");
      setFocusHint(true);
    } catch (err) {
      console.error("Could not disable MFA", err);
      setError("Could not turn off two-step verification. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") return null;

  return (
    <div className="profile-section">
      <span className="profile-field-label">Two-step verification</span>
      {error && <div className="gw-alert gw-alert--urgent profile-alert profile-alert--error" role="alert">{error}</div>}

      {status === "on" ? (
        <>
          {MFA_DEADLINE_ISO && mfaDeadlinePhase() === "before" ? (
            <p className="profile-hint" ref={hint} tabIndex={-1}>
              Two-step verification is on. GrantWell requires it from{" "}
              {deadlineDateText(MFA_DEADLINE_ISO, true)}, so it can&apos;t be turned off.
            </p>
          ) : MFA_DEADLINE_ISO || MFA_REQUIRED ? (
            <p className="profile-hint" ref={hint} tabIndex={-1}>
              On. Two-step verification is required on GrantWell, so it can&apos;t be turned off.
            </p>
          ) : (
            <>
              <p className="profile-hint" ref={hint} tabIndex={-1}>
                On. You are asked for a code from your authenticator app when you sign in.
              </p>
              <div className="profile-actions">
                <Button type="button" variant="secondary" onClick={turnOff} loading={busy}>
                  Turn off
                </Button>
              </div>
            </>
          )}
        </>
      ) : enrolling ? (
        <MfaSetupPanel
          email={email}
          onEnrolled={() => {
            setEnrolling(false);
            clearMfaPromptSnooze(userId);
            setStatus("on");
            setFocusHint(true);
          }}
          onCancel={() => {
            setEnrolling(false);
            setFocusHint(true);
          }}
        />
      ) : (
        <>
          <p className="profile-hint" ref={hint} tabIndex={-1}>
            {MFA_DEADLINE_ISO && mfaDeadlinePhase() === "before"
              ? `Off. GrantWell requires it from ${deadlineDateText(MFA_DEADLINE_ISO, true)}.`
              : MFA_DEADLINE_ISO || MFA_REQUIRED
                ? "Off. Two-step verification is required on GrantWell."
                : "Off. Recommended — it keeps your account safe if your password is ever exposed."}
          </p>
          <div className="profile-actions">
            <Button type="button" onClick={() => setEnrolling(true)}>
              Set up two-step verification
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AccountActionsCard({ onSignedOut }: { onSignedOut: () => void }) {
  const [showPw, setShowPw] = useState(false);
  const [revealPw, setRevealPw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);
  const firstPwField = useRef<HTMLInputElement>(null);
  const changePwButton = useRef<HTMLButtonElement>(null);
  const [pwFocus, setPwFocus] = useState<"form" | "button" | null>(null);
  useEffect(() => {
    if (pwFocus === "form") firstPwField.current?.focus();
    if (pwFocus === "button") changePwButton.current?.focus();
    setPwFocus(null);
  }, [pwFocus]);

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
      await updatePassword({ oldPassword: oldPw, newPassword: newPw });
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
      setShowPw(false);
      setRevealPw(false);
      // Cognito's ChangePassword leaves existing refresh tokens valid; only a global sign-out revokes them.
      try {
        await signOut({ global: true });
        setPwOk(true);
        onSignedOut();
      } catch (signOutError) {
        console.error("Could not revoke other sessions after password change:", signOutError);
        setPwError(
          'Your password was changed, but we could not sign out your other devices. Use "Sign out of all devices" to finish.'
        );
      }
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
      await signOut({ global: true });
    } catch (err) {
      console.error("Global sign-out failed:", err);
    } finally {
      onSignedOut();
    }
  };

  return (
    <Card header="Sign-in & security" headerStyle="default">
      {MFA_ENABLED && <MfaSection />}

      {pwError && <div className="gw-alert gw-alert--urgent profile-alert profile-alert--error" role="alert">{pwError}</div>}
      <LiveStatus>
        {pwOk && <div className="gw-alert gw-alert--success profile-alert profile-alert--success">Password changed. You have been signed out on every device — sign in again with your new password.</div>}
      </LiveStatus>

      {showPw ? (
        <form onSubmit={changePassword}>
          <div className="profile-section">
            <label className="profile-field-label" htmlFor="pw-old">Current password</label>
            <input ref={firstPwField} id="pw-old" type={revealPw ? "text" : "password"} autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required className="gw-input profile-input" />
          </div>
          <div className="profile-section">
            <label className="profile-field-label" htmlFor="pw-new">New password</label>
            <input id="pw-new" type={revealPw ? "text" : "password"} autoComplete="new-password" aria-describedby="pw-new-requirements" value={newPw} onChange={(e) => setNewPw(e.target.value)} required className="gw-input profile-input" />
            <PasswordRequirementsList id="pw-new-requirements" requirements={getPasswordRequirements(newPw)} />
          </div>
          <div className="profile-section">
            <label className="profile-field-label" htmlFor="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" type={revealPw ? "text" : "password"} autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required className="gw-input profile-input" />
          </div>
          <div className="profile-section">
            <label className="profile-show-password">
              <input type="checkbox" checked={revealPw} onChange={(e) => setRevealPw(e.target.checked)} />
              Show passwords
            </label>
          </div>
          <div className="profile-actions">
            <Button type="submit" loading={busy}>Update password</Button>
            <Button type="button" variant="ghost" onClick={() => { if (busy) return; setShowPw(false); setRevealPw(false); setPwFocus("button"); }} aria-disabled={busy || undefined}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="profile-actions">
          <Button ref={changePwButton} type="button" variant="secondary" onClick={() => { setShowPw(true); setPwFocus("form"); }}>Change password</Button>
          <Button type="button" variant="danger" onClick={signOutEverywhere} loading={busy}>Sign out of all devices</Button>
        </div>
      )}
    </Card>
  );
}
