declare module "*.module.css";
declare module "*.module.scss";

interface Window {
  dataLayer: any[];
  gtag: (
    command: string,
    targetId: string,
    config?: {
      page_title?: string;
      page_path?: string;
      page_location?: string;
      [key: string]: any;
    }
  ) => void;
  __ENVIRONMENT__?: string;
}