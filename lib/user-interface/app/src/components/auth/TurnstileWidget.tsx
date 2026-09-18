import { useEffect, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import { TURNSTILE_SITE_KEY } from "./turnstile-config";

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
}

export default function TurnstileWidget({
  action,
  onToken,
  resetKey,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          callback: (token) => {
            setFailed(false);
            onTokenRef.current(token);
          },
          "error-callback": () => {
            setFailed(true);
            onTokenRef.current("");
          },
          "expired-callback": () => onTokenRef.current(""),
          "timeout-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action]);

  // Turnstile tokens are single-use, so every submission needs a freshly issued one.
  useEffect(() => {
    if (resetKey === 0) return;
    if (!widgetIdRef.current || !window.turnstile) return;
    onTokenRef.current("");
    window.turnstile.reset(widgetIdRef.current);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div className="mb-3">
      <div ref={containerRef} />
      <div aria-live="polite" aria-atomic="true">
        {failed && (
          <Alert variant="danger" className="mb-0 mt-2">
            Security check could not load. Refresh the page and try again.
          </Alert>
        )}
      </div>
    </div>
  );
}
