import React from "react";
import { useBranding } from "../../../common/branding";

const AboutPanel = React.memo(function AboutPanel() {
  const { appName, orgName } = useBranding();
  return (
  <div className="about-panel">
    <h2 className="about-panel__heading">About {appName}</h2>
    <p className="about-panel__text">
      {appName} is a free, AI-enabled tool designed to simplify the federal
      and state grant application process for municipalities, community
      groups, and underserved populations.
      {orgName ? ` Developed by ${orgName}.` : ""}
    </p>
    <p className="about-panel__text">
      GrantWell removes barriers that often prevent smaller communities from
      accessing critical funding opportunities. The tool is specifically built
      to empower historically underfunded and understaffed communities by
      reducing the complexity and time required for grant applications.
    </p>
  </div>
  );
});

export default AboutPanel;
