import React from "react";

interface StepBandProps {
  title: string;
  /** One line under the title. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** The brand-filled heading band at the top of each Write application step. */
export default function StepBand({ title, description, actions, className }: StepBandProps) {
  const heading = <h2 className="gw-step-band__title">{title}</h2>;
  return (
    <div className={className ? `gw-step-band ${className}` : "gw-step-band"}>
      {description ? (
        <div className="gw-step-band__heading">
          {heading}
          <p className="gw-step-band__description">{description}</p>
        </div>
      ) : (
        heading
      )}
      {actions && <div className="gw-step-band__actions">{actions}</div>}
    </div>
  );
}
