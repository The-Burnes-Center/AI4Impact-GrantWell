import { useEffect, useState } from "react";
import {
  ThemeProvider,
  defaultDarkModeOverride,
} from "@aws-amplify/ui-react";
import { BrowserRouter } from "react-router-dom";
import { Amplify, Auth, Hub } from "aws-amplify";
import { Alert, Spinner } from "react-bootstrap";
import App from "../App";
import { AppConfig } from "../common/types/app";
import { AppContext } from "../common/app-context";
import { StorageHelper } from "../common/helpers/storage-helper";
import "@aws-amplify/ui-react/styles.css";
import AuthPage from "../pages/auth/AuthPage";
import BrandBanner from "./mds/BrandBanner";
import FooterComponent from "./mds/MdsFooter";
import MDSHeader from "./mds/MdsHeader";

async function getInitialAuthState() {
  try {
    await Auth.currentAuthenticatedUser();
    return true;
  } catch {
    return false;
  }
}

export default function AppConfigured() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [theme, setTheme] = useState(StorageHelper.getTheme());
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadConfiguration = async () => {
      try {
        const result = await fetch("/aws-exports.json");
        if (!result.ok) {
          throw new Error(`Failed to load auth configuration: ${result.status}`);
        }

        const awsExports = (await result.json()) as AppConfig;
        Amplify.configure(awsExports);

        const isAuthenticated = await getInitialAuthState();
        if (cancelled) return;

        setConfig(awsExports);
        setAuthenticated(isAuthenticated);
      } catch (configError) {
        if (cancelled) return;

        console.error("Configuration error:", configError);
        setError(true);
      } finally {
        if (!cancelled) {
          setConfigured(true);
        }
      }
    };

    loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signIn":
        case "tokenRefresh":
          setAuthenticated(true);
          break;
        case "signOut":
          setAuthenticated(false);
          if (window.location.pathname !== "/") {
            window.location.href = "/";
          }
          break;
        case "signIn_failure":
          setAuthenticated(false);
          break;
        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const newValue = document.documentElement.style.getPropertyValue(
            "--app-color-scheme",
          );
          const mode = newValue === "dark" ? "dark" : "light";

          if (mode !== theme) {
            setTheme(mode);
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => {
      observer.disconnect();
    };
  }, [theme]);

  if (!config) {
    if (error) {
      return (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Alert variant="danger">
            <Alert.Heading>Configuration error</Alert.Heading>
            Error loading configuration from{" "}
            <a href="/aws-exports.json" style={{ fontWeight: "600" }}>
              /aws-exports.json
            </a>
          </Alert>
        </div>
      );
    }

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Spinner animation="border" size="sm" />
          <span>Loading</span>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={config}>
      <ThemeProvider
        theme={{
          name: "default-theme",
          overrides: [defaultDarkModeOverride],
        }}
        colorMode={theme === "dark" ? "dark" : "light"}
      >
        <BrowserRouter
          future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true,
          }}
        >
          <AppLayoutContent
            authenticated={authenticated}
            configured={configured}
            onAuthenticated={() => setAuthenticated(true)}
          />
        </BrowserRouter>
      </ThemeProvider>
    </AppContext.Provider>
  );
}

function AppLayoutContent({
  authenticated,
  configured,
  onAuthenticated,
}: {
  authenticated: boolean | null;
  configured: boolean;
  onAuthenticated: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <BrandBanner />
      <MDSHeader showSignOut={authenticated === true} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {authenticated ? (
          <App />
        ) : configured ? (
          <AuthPage onAuthenticated={onAuthenticated} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Spinner animation="border" size="sm" />
            <span>Loading</span>
          </div>
        )}
      </div>
      <FooterComponent />
    </div>
  );
}
