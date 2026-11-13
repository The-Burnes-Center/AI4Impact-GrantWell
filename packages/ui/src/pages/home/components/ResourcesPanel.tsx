import React from "react";

const RESOURCES = [
  {
    title: "Federal grant finder",
    href: "https://simpler.grants.gov/",
    description:
      "Find grants you are eligible for with Grants.gov Federal Grants Finder.",
  },
];

const ResourcesPanel = React.memo(function ResourcesPanel() {
  return (
  <div className="resources-panel">
    <h2 className="resources-panel__heading">Additional resources</h2>
    {RESOURCES.map((resource, index) => (
      <div key={index} className="resource-card">
        <a
          href={resource.href}
          target="_blank"
          rel="noopener noreferrer"
          className="resource-card__link"
        >
          <h3 className="resource-card__title">
            {resource.title}
            <span className="visually-hidden"> (opens in new tab)</span>
          </h3>
          <div className="resource-card__desc">{resource.description}</div>
        </a>
      </div>
    ))}
  </div>
  );
});

export default ResourcesPanel;
