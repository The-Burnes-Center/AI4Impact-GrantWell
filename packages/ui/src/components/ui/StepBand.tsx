import React from "react";

interface StepBandProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

/** The brand-filled heading band at the top of each Write application step. */
export default function StepBand({ title, actions, className }: StepBandProps) {
  return (
    <div className={className ? `gw-step-band ${className}` : "gw-step-band"}>
      <h2 className="gw-step-band__title">{title}</h2>
      {actions && <div className="gw-step-band__actions">{actions}</div>}
    </div>
  );
}
