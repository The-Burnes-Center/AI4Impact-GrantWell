declare module "*.css";
declare module "*.module.css";
declare module "*.module.scss";
declare module "react-speech-recognition";

// Build-time instance id, injected by vite `define` from the GRANTWELL_INSTANCE env var.
declare const __GRANTWELL_INSTANCE__: string;

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
}