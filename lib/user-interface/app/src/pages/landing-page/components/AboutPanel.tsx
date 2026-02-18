import React from "react";

const AboutPanel: React.FC = () => (
  <div className="about-panel">
    <h2 className="about-panel__heading">About GrantWell</h2>
    <p className="about-panel__text">
      GrantWell is a free, AI-enabled tool designed to simplify the federal
      grant application process for municipalities, community groups, and
      underserved populations in Massachusetts. Developed through Northeastern
      University&apos;s AI for Impact program in collaboration with the
      Commonwealth of Massachusetts and the Federal Funds &amp; Infrastructure
      Office (FFIO).
    </p>
    <p className="about-panel__text">
      GrantWell removes barriers that often prevent smaller communities from
      accessing critical funding opportunities. The tool is specifically built
      to empower historically underfunded and understaffed communities by
      reducing the complexity and time required for grant applications.
    </p>
  </div>
);

export default AboutPanel;
