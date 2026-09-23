import { useEffect, useRef, useState } from "react";
import { PasswordRequirements } from "./auth-types";

interface PasswordRequirementsListProps {
  requirements: PasswordRequirements;
  id: string;
}

const REQUIREMENTS: {
  key: keyof PasswordRequirements;
  label: string;
  shortLabel: string;
}[] = [
  {
    key: "minLength",
    label: "Password must be at least 8 characters",
    shortLabel: "at least 8 characters",
  },
  { key: "hasNumber", label: "Use a number", shortLabel: "a number" },
  {
    key: "hasLowercase",
    label: "Use a lowercase letter",
    shortLabel: "a lowercase letter",
  },
  {
    key: "hasUppercase",
    label: "Use an uppercase letter",
    shortLabel: "an uppercase letter",
  },
  { key: "hasSymbol", label: "Use a symbol", shortLabel: "a symbol" },
];

export default function PasswordRequirementsList({
  requirements,
  id,
}: PasswordRequirementsListProps) {
  const [announcement, setAnnouncement] = useState("");
  const previousRequirements = useRef<PasswordRequirements | null>(null);

  useEffect(() => {
    const previous = previousRequirements.current;
    previousRequirements.current = requirements;
    if (!previous) return;

    const changed = REQUIREMENTS.filter(
      ({ key }) => requirements[key] !== previous[key]
    );
    if (changed.length === 0) return;

    const metCount = REQUIREMENTS.filter(({ key }) => requirements[key]).length;
    const newlyMet = changed
      .filter(({ key }) => requirements[key])
      .map(({ shortLabel }) => shortLabel);
    const progress = `${metCount} of ${REQUIREMENTS.length} password requirements met.`;

    setAnnouncement(
      newlyMet.length > 0 ? `Added ${newlyMet.join(", ")}. ${progress}` : progress
    );
  }, [requirements]);

  return (
    <>
      <div
        id={id}
        className="password-requirements mt-2"
        role="group"
        aria-label="Password requirements"
      >
        <small>
          {REQUIREMENTS.map(({ key, label }) => (
            <div
              key={key}
              className={`password-requirement ${
                requirements[key] ? "text-success" : "text-muted"
              }`}
            >
              <span aria-hidden="true" className="requirement-icon">
                {requirements[key] ? "✓" : "○"}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </small>
      </div>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  );
}
