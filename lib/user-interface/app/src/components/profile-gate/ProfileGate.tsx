import React, { useCallback, useEffect, useState } from "react";
import { Spinner } from "react-bootstrap";
import { useApiClient } from "../../hooks/use-api-client";
import Card from "../ui/Card";
import Button from "../ui/Button";
import "./profile-gate.css";

interface ProfileGateProps {
  children: React.ReactNode;
}

/**
 * Hard-block gate: an authenticated user cannot use the app until Agency, Organization, and
 * Role/Title are on file. Existing users hit this once on their next login. Fails open — if the
 * profile can't be read, we let the user through rather than trapping them behind a broken gate.
 */
export default function ProfileGate({ children }: ProfileGateProps) {
  const apiClient = useApiClient();
  const [checking, setChecking] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);

  const [agency, setAgency] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await apiClient.userProfile.getProfile();
        if (!active) return;
        setAgency(profile.agency || "");
        setOrganization(profile.organization || "");
        setJobTitle(profile.jobTitle || "");
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

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!agency.trim() || !organization.trim() || !jobTitle.trim()) {
        setError("Please complete all three fields.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await apiClient.userProfile.updateProfile({
          agency: agency.trim(),
          organization: organization.trim(),
          jobTitle: jobTitle.trim(),
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
    [apiClient, agency, organization, jobTitle]
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

  return (
    <div
      className="profile-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-gate-title"
    >
      <div className="profile-gate__panel">
        <Card header="Complete your profile">
          <p className="profile-hint" id="profile-gate-title">
            Before you continue, tell us a little about where you work. This helps
            us understand who&apos;s using GrantWell. All fields are required.
          </p>

          {error && (
            <div className="profile-alert profile-alert--error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div className="profile-section">
              <label className="profile-field-label" htmlFor="gate-agency">
                Agency
              </label>
              <input
                id="gate-agency"
                type="text"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                required
                placeholder="e.g. Department of Transportation"
                style={{ width: "100%" }}
              />
            </div>

            <div className="profile-section">
              <label className="profile-field-label" htmlFor="gate-org">
                Organization
              </label>
              <input
                id="gate-org"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                required
                placeholder="e.g. City of Springfield"
                style={{ width: "100%" }}
              />
            </div>

            <div className="profile-section">
              <label className="profile-field-label" htmlFor="gate-title">
                Role / Title
              </label>
              <input
                id="gate-title"
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                required
                placeholder="e.g. Grants Manager"
                style={{ width: "100%" }}
              />
            </div>

            <div className="profile-actions">
              <Button type="submit" loading={saving}>
                Save and continue
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
