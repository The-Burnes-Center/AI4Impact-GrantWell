import { useState } from "react";
import { LuX } from "react-icons/lu";
import "../styles/state-site-notice.css";
import { stateNameFromCode } from "../common/states";
import { stateSiteFor } from "../common/state-sites";
import { useAdminCheck } from "../hooks/use-admin-check";

const DISMISSED_KEY = "gw-state-site-notice-dismissed";

const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** For a signed-in user whose state now has its own GrantWell site; closing it lasts for the browser session. */
export default function StateSiteNotice() {
  const { userState, loading } = useAdminCheck();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const site = stateSiteFor(userState);
  if (loading || !site || dismissed) return null;

  const name = stateNameFromCode(site.state) ?? site.state;
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Still hidden for this page.
    }
    setDismissed(true);
  };

  return (
    <aside className="state-site-notice" aria-label={`${name} has its own GrantWell`}>
      <p className="state-site-notice__text">
        {name} now has its own GrantWell at <a href={site.url}>{new URL(site.url).host}</a>. Your chats and
        applications will move there soon.
      </p>
      <button type="button" className="state-site-notice__close" onClick={dismiss} aria-label="Dismiss this notice">
        <LuX size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
