import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router";

type PageMessageAction = { label: string; to: string } | { label: string; onClick: () => void };

interface PageMessageProps {
  title: string;
  message: ReactNode;
  action: PageMessageAction;
  /** For failures the user didn't ask for (a crash, a failed load). */
  alert?: boolean;
  /** When the message replaces the control that had focus. */
  focusTitle?: boolean;
}

/** Full-page message (not found, unavailable, something went wrong): an h1, one sentence, one button. */
export default function PageMessage({ title, message, action, alert, focusTitle }: PageMessageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) heading.current?.focus();
  }, [focusTitle]);

  return (
    <div className="gw-page-message" role={alert ? "alert" : undefined}>
      <h1 ref={heading} tabIndex={focusTitle ? -1 : undefined} className="gw-page-message__title">
        {title}
      </h1>
      <p className="gw-page-message__text">{message}</p>
      {"to" in action ? (
        <Link className="gw-btn gw-btn--primary" to={action.to}>
          {action.label}
        </Link>
      ) : (
        <button type="button" className="gw-btn gw-btn--primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
