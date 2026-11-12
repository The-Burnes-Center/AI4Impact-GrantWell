import React, { useEffect, useState } from "react";

/**
 * A polite status region; pass the message as children only while it applies. Screen readers often stay
 * silent when a region arrives already holding its text, so the region renders empty first and shows its
 * message a moment later, even when it mounts together with the message (e.g. inside a panel just opened).
 */
export function LiveStatus({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={className}>
      {ready ? children : null}
    </div>
  );
}
