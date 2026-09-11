declare module "*.css";
declare module "*.module.css";
declare module "*.module.scss";
declare module "react-speech-recognition";

// Build-time instance id, injected by vite `define` from the GRANTWELL_INSTANCE env var.
declare const __GRANTWELL_INSTANCE__: string;

// Cloudflare Turnstile site key, injected by vite `define`. Empty string when unconfigured.
declare const __TURNSTILE_SITE_KEY__: string;

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

interface Window {
  dataLayer: Record<string, unknown>[];
  gtag: (
    command: string,
    targetId: string,
    config?: {
      page_title?: string;
      page_path?: string;
      page_location?: string;
      [key: string]: string | undefined;
    }
  ) => void;
  __ENVIRONMENT__?: string;
  turnstile?: TurnstileApi;
}