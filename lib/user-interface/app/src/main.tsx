import "regenerator-runtime/runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import AppConfigured from "./components/app-configured";
import { StorageHelper } from "./common/helpers/storage-helper";
import "bootstrap/dist/css/bootstrap.min.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const theme = StorageHelper.getTheme();
StorageHelper.applyTheme(theme);

root.render(
  <React.StrictMode>
    <AppConfigured />
  </React.StrictMode>
);
