declare module "*.module.css";
declare module "*.module.scss";

interface Window {
  dataLayer: any[];
  gtag: (
    command: string,
    targetId: string,
    config?: {
      page_path?: string;
      [key: string]: any;
    }
  ) => void;
}