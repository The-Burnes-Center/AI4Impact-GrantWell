import React from "react";
import { Link } from "react-router";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex" }}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li
              key={item.label}
              className="breadcrumb-item"
              aria-current={isLast ? "page" : undefined}
            >
              {isLast || (!item.href && !item.onClick) ? (
                item.label
              ) : item.href ? (
                <Link to={item.href} className="breadcrumb-link">
                  {item.label}
                </Link>
              ) : (
                <button type="button" className="breadcrumb-link" onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
