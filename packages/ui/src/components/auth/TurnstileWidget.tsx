import { useEffect, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import { TURNSTILE_SITE_KEY } from "./turnstile-config";
import { useBranding } from "../../common/branding";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";



let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Allow a later mount to retry rather than caching the failure forever.
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Distinguishes the flow in Cloudflare analytics, e.g. "sign-in". */
  action: string;
  onToken: (token: string) => void;
  /** Changing this discards the current token and re-runs the challenge. */
  resetKey: number;
  className?: string;
}

export default function TurnstileWidget({
  action,
  onToken,
  resetKey,
  className = "mb-3",
}: TurnstileWidgetProps) {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { supportEmail } = useBranding();

  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        // A visible challenge is a fixed 300px wide; compact is the only size that fits a narrower column.
        const width = containerRef.current.getBoundingClientRect().width;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          ...(width > 0 && width < 300 ? { size: "compact" as const } : {}),
          callback: (token) => {
            setFailed(false);
            setRetrying(false);
            onTokenRef.current(token);
          },
          "error-callback": () => {
            setFailed(true);
            setRetrying(false);
            onTokenRef.current("");
          },
          "expired-callback": () => onTokenRef.current(""),
          "timeout-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setRetrying(false);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, attempt]);

  // Turnstile tokens are single-use, so every submission needs a freshly issued one.
  useEffect(() => {
    if (resetKey === 0) return;
    if (!widgetIdRef.current || !window.turnstile) return;
    onTokenRef.current("");
    window.turnstile.reset(widgetIdRef.current);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div className={`turnstile-field ${className}`} ref={fieldRef} tabIndex={-1}>
      <div className="turnstile-widget" ref={containerRef} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <Alert variant="danger" className="mb-0 mt-2" transition={false} role={undefined}>
            The security check didn&apos;t load.{" "}
            {supportEmail ? <>If it keeps failing, email {supportEmail}.</> : "If it keeps failing, refresh the page."}
          </Alert>
        ) : retrying ? (
          <span className="visually-hidden">Running the security check again…</span>
        ) : null}
      </div>
      {/* Outside the live region, so the button isn't read out as part of the message. */}
      {failed && (
        <button
          type="button"
          className="gw-btn gw-btn--secondary gw-btn--slim mt-2"
          onClick={() => {
            // The button goes away with the message, so hold focus in the same place in the tab order.
            fieldRef.current?.focus();
            setFailed(false);
            setRetrying(true);
            setAttempt((n) => n + 1);
          }}
        >
          Try the check again
        </button>
      )}
    </div>
  );
}
