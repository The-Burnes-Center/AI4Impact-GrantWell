import React from "react";

const AboutPanel = React.memo(function AboutPanel() {
  return (
  <div className="about-panel">
    <h2 className="about-panel__heading">About GrantWell</h2>
    <p className="about-panel__text">
      GrantWell is a free, AI-enabled tool designed to simplify the federal
      and state grant application process for municipalities, community
      groups, and underserved populations. Developed through Northeastern
      University&apos;s AI for Impact program at the Burnes Center.
    </p>
    <p className="about-panel__text">
      GrantWell removes barriers that often prevent smaller communities from
      accessing critical funding opportunities. The tool is specifically built
      to empower historically underfunded and understaffed communities by
      reducing the complexity and time required for grant applications.
    </p>
    <div className="about-panel__video-wrapper">
      <iframe
        src="https://www.youtube.com/embed/Lsup892o2yg"
        title="GrantWell Demo Video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  </div>
  );
});

export default AboutPanel;
