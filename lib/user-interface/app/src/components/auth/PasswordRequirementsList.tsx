import { PasswordRequirements } from "./auth-types";

interface PasswordRequirementsListProps {
  requirements: PasswordRequirements;
  id: string;
}

export default function PasswordRequirementsList({
  requirements,
  id,
}: PasswordRequirementsListProps) {
  return (
    <div
      id={id}
      className="password-requirements mt-2"
      role="group"
      aria-label="Password requirements"
    >
      <small>
        <div
          className={`password-requirement ${
            requirements.minLength ? "text-success" : "text-muted"
          }`}
        >
          <span aria-hidden="true" className="requirement-icon">
            {requirements.minLength ? "✓" : "○"}
          </span>
          <span>Password must be at least 8 characters</span>
        </div>
        <div
          className={`password-requirement ${
            requirements.hasNumber ? "text-success" : "text-muted"
          }`}
        >
          <span aria-hidden="true" className="requirement-icon">
            {requirements.hasNumber ? "✓" : "○"}
          </span>
          <span>Use a number</span>
        </div>
        <div
          className={`password-requirement ${
            requirements.hasLowercase ? "text-success" : "text-muted"
          }`}
        >
          <span aria-hidden="true" className="requirement-icon">
            {requirements.hasLowercase ? "✓" : "○"}
          </span>
          <span>Use a lowercase letter</span>
        </div>
        <div
          className={`password-requirement ${
            requirements.hasUppercase ? "text-success" : "text-muted"
          }`}
        >
          <span aria-hidden="true" className="requirement-icon">
            {requirements.hasUppercase ? "✓" : "○"}
          </span>
          <span>Use an uppercase letter</span>
        </div>
        <div
          className={`password-requirement ${
            requirements.hasSymbol ? "text-success" : "text-muted"
          }`}
        >
          <span aria-hidden="true" className="requirement-icon">
            {requirements.hasSymbol ? "✓" : "○"}
          </span>
          <span>Use a symbol</span>
        </div>
      </small>
    </div>
  );
}
