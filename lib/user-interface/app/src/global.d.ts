declare module "*.module.css";
declare module "*.module.scss";
declare module "react-speech-recognition";
declare module "@massds/mayflower-react";

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