import type { ReactNode } from "react";
import { GRANT_TYPES, grantTypeTint, type GrantTypeId } from "../../common/types/nofo";
import { Utils } from "../../common/utils";

export interface GrantFacts {
  expirationDate?: string | null;
  isRolling?: boolean;
  grantType?: string | null;
}

interface GrantHeaderProps {
  /** The page's name, shown small above the grant: "Requirements", "Chat", "Write application". */
  page: string;
  grantName: string;
  facts?: GrantFacts;
  actions?: ReactNode;
  className?: string;
}

/** Shared title block of the grant pages: page name, grant name (the h1) and the facts the page already has. */
export default function GrantHeader({ page, grantName, facts, actions, className }: GrantHeaderProps) {
  const grantType = facts?.grantType && facts.grantType in GRANT_TYPES ? GRANT_TYPES[facts.grantType as GrantTypeId] : null;
  const due = facts?.isRolling
    ? "Rolling deadline"
    : facts?.expirationDate
      ? `Due ${Utils.formatExpirationDate(facts.expirationDate)}`
      : null;

  return (
    <div className={className ? `gw-grant-header ${className}` : "gw-grant-header"}>
      <div className="gw-grant-header__main">
        <h1 className="gw-grant-header__title">
          <span className="gw-grant-header__page">
            {page}
            <span className="visually-hidden">:</span>
          </span>{" "}
          <span className="gw-grant-header__name">{grantName}</span>
        </h1>
        {(due || grantType) && (
          <ul className="gw-grant-header__facts" aria-label="Key facts">
            {due && <li className="gw-grant-header__fact">{due}</li>}
            {grantType && (
              <li
                className="gw-grant-header__fact gw-grant-header__fact--type"
                style={{
                  backgroundColor: grantTypeTint(grantType.color, 8),
                  color: grantType.color,
                  borderColor: grantTypeTint(grantType.color, 25),
                }}
              >
                {grantType.label}
              </li>
            )}
          </ul>
        )}
      </div>
      {actions && <div className="gw-grant-header__actions">{actions}</div>}
    </div>
  );
}
