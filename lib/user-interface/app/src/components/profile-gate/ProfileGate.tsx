import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "react-bootstrap";
import {
  LuBuilding2,
  LuLandmark,
  LuBriefcase,
  LuMapPin,
  LuArrowRight,
  LuTriangleAlert,
} from "react-icons/lu";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { stateNameFromCode } from "../../common/generated/states";
import Button from "../ui/Button";
import "./profile-gate.css";

interface ProfileGateProps {
  children: React.ReactNode;
}

type FieldKey = "agency" | "organization" | "jobTitle";

const FIELDS: {
  key: FieldKey;
  label: string;
  placeholder: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}[] = [
  {
    key: "agency",
    label: "Agency",
    placeholder: "e.g. Department of Transportation",
    Icon: LuLandmark,
  },
  {
    key: "organization",
    label: "Organization",
    placeholder: "e.g. City of Springfield",
    Icon: LuBuilding2,
  },
  {
    key: "jobTitle",
    label: "Role / Title",
    placeholder: "e.g. Grants Manager",
    Icon: LuBriefcase,
  },
];

/**
 * Hard-block gate: an authenticated user cannot use the app until Agency, Organization, and
 * Role/Title are on file. Existing users hit this once on their next login. Fails open — if the
 * profile can't be read, we let the user through rather than trapping them behind a broken gate.
 */
export default function ProfileGate({ children }: ProfileGateProps) {
  const apiClient = useApiClient();
  const { userState } = useAdminCheck();
  const [checking, setChecking] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);
  // The user's assigned state, read-only here (set by an admin, not self-chosen). Prefer the
  // profile row; fall back to the JWT claim (a brand-new profile row may not carry it yet).
  const [profileState, setProfileState] = useState("");

  const [values, setValues] = useState<Record<FieldKey, string>>({
    agency: "",
    organization: "",
    jobTitle: "",
  });
  // A field only shows its error once the user has left it (blurred), so we don't scold empty
  // fields before they've had a chance to type.
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    agency: false,
    organization: false,
    jobTitle: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await apiClient.userProfile.getProfile();
        if (!active) return;
        setValues({
          agency: profile.agency || "",
          organization: profile.organization || "",
          jobTitle: profile.jobTitle || "",
        });
        setProfileState(profile.state || "");
        setNeedsProfile(!profile.profileComplete);
      } catch {
        // Fail open: don't trap the user behind a gate we can't evaluate.
        if (active) setNeedsProfile(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiClient]);

  const allFilled = useMemo(
    () => FIELDS.every((f) => values[f.key].trim().length > 0),
    [values]
  );

  const setField = (key: FieldKey, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setTouched({ agency: true, organization: true, jobTitle: true });
      if (!allFilled) {
        setError("Please complete all three fields.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await apiClient.userProfile.updateProfile({
          agency: values.agency.trim(),
          organization: values.organization.trim(),
          jobTitle: values.jobTitle.trim(),
        });
        setNeedsProfile(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save your profile."
        );
      } finally {
        setSaving(false);
      }
    },
    [apiClient, allFilled, values]
  );

  if (checking) {
    return (
      <div className="profile-gate__loading" role="status" aria-live="polite">
        <Spinner animation="border" size="sm" aria-hidden="true" />
        <span>Loading</span>
      </div>
    );
  }

  if (!needsProfile) {
    return <>{children}</>;
  }

  const effectiveState = profileState || userState || "";
  const stateLabel = effectiveState
    ? stateNameFromCode(effectiveState) || effectiveState
    : "";

  return (
    <div
      className="profile-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-gate-title"
    >
      <div className="profile-gate__panel">
        <header className="profile-gate__header">
          <span className="profile-gate__header-icon" aria-hidden="true">
            <LuBuilding2 size={22} />
          </span>
          <h2 className="profile-gate__title" id="profile-gate-title">
            Complete your profile
          </h2>
        </header>

        <div className="profile-gate__body">
          <p className="profile-gate__lead">
            One-time setup. Tell us a little about where you work — this helps us
            understand who&apos;s using GrantWell.
          </p>

          {error && (
            <div className="profile-gate__alert" role="alert">
              <LuTriangleAlert size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            {FIELDS.map(({ key, label, placeholder, Icon }) => {
              const showError = touched[key] && values[key].trim().length === 0;
              const inputId = `gate-${key}`;
              return (
                <div className="profile-gate__field" key={key}>
                  <label className="profile-gate__label" htmlFor={inputId}>
                    {label} <span className="profile-gate__req">*</span>
                  </label>
                  <div
                    className={`profile-gate__input-wrap ${
                      showError ? "profile-gate__input-wrap--error" : ""
                    }`}
                  >
                    <span className="profile-gate__field-icon" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <input
                      id={inputId}
                      type="text"
                      value={values[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, [key]: true }))
                      }
                      placeholder={placeholder}
                      required
                      aria-invalid={showError}
                      aria-describedby={showError ? `${inputId}-err` : undefined}
                    />
                  </div>
                  {showError && (
                    <p
                      className="profile-gate__field-error"
                      id={`${inputId}-err`}
                    >
                      <LuTriangleAlert size={13} aria-hidden="true" />
                      {label} is required
                    </p>
                  )}
                </div>
              );
            })}

            <div className="profile-gate__field">
              <label className="profile-gate__label" htmlFor="gate-state">
                State
              </label>
              <div className="profile-gate__input-wrap profile-gate__input-wrap--readonly">
                <span className="profile-gate__field-icon" aria-hidden="true">
                  <LuMapPin size={16} />
                </span>
                <select
                  id="gate-state"
                  value={effectiveState}
                  disabled
                  aria-readonly="true"
                  title="Your state is assigned by an administrator"
                >
                  {effectiveState ? (
                    <option value={effectiveState}>{stateLabel}</option>
                  ) : (
                    <option value="">Not assigned</option>
                  )}
                </select>
              </div>
              <p className="profile-gate__hint">
                Assigned by your administrator.
              </p>
            </div>

            <Button
              type="submit"
              loading={saving}
              disabled={!allFilled}
              fullWidth
            >
              <span className="profile-gate__submit-content">
                Save and continue
                <LuArrowRight size={16} aria-hidden="true" />
              </span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
