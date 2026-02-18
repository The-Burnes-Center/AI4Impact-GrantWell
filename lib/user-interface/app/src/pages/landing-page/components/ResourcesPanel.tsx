import React from "react";

const RESOURCES = [
  {
    title: "Federal Grant Finder",
    href: "https://simpler.grants.gov/",
    description:
      "Find grants you are eligible for with Grants.gov Federal Grants Finder.",
  },
  {
    title: "Register for Federal Funds Partnership Meetings",
    href: "https://us02web.zoom.us/meeting/register/tZUucuyhrzguHNJkkh-XlmZBlQQKxxG_Acjl",
    description:
      "Stay updated on current funding opportunities by joining our monthly informational sessions.",
  },
];

const ResourcesPanel: React.FC = () => (
  <div className="resources-panel">
    <h2 className="resources-panel__heading">Additional Resources</h2>
    {RESOURCES.map((resource, index) => (
      <div key={index} className="resource-card">
        <a
          href={resource.href}
          target="_blank"
          rel="noopener noreferrer"
          className="resource-card__link"
        >
          <span className="resource-card__title">{resource.title}</span>
          <div className="resource-card__desc">{resource.description}</div>
        </a>
      </div>
    ))}
  </div>
);

export default ResourcesPanel;
