import React from "react";
import Breadcrumbs from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  /** Given when the page moves focus to its heading, which then takes tabIndex -1. */
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/** Breadcrumb, title, intro and actions shared by the signed-in list and account pages. */
export default function PageHeader({ title, intro, actions, headingRef }: PageHeaderProps) {
  return (
    <div className="gw-page-header">
      <Breadcrumbs items={[{ label: "Home", href: "/home" }, { label: title }]} />
      <div className="dashboard-header dashboard-header--wrap">
        <div>
          <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
            {title}
          </h1>
          {intro && <p className="dashboard-header__description">{intro}</p>}
        </div>
        {actions && <div className="dashboard-actions">{actions}</div>}
      </div>
    </div>
  );
}
