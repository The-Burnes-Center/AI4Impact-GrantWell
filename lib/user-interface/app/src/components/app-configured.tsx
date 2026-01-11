import { useEffect, useState } from "react";
import {
  ThemeProvider,
  defaultDarkModeOverride,
} from "@aws-amplify/ui-react";
import { BrowserRouter } from "react-router-dom";
import App from "../app";
import { Amplify, Auth, Hub } from "aws-amplify";
import { AppConfig } from "../common/types";
import { AppContext } from "../common/app-context";
import { Alert, StatusIndicator } from "@cloudscape-design/components";
import { StorageHelper } from "../common/helpers/storage-helper";
import { Mode } from "@cloudscape-design/global-styles";
import "@aws-amplify/ui-react/styles.css";
import AuthPage from "../pages/auth/auth-page";
import BrandBanner from "./brand-banner";
import MDSHeader from "./mds-header";
import FooterComponent from "./footer";

export default function AppConfigured() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(null);
  const [theme, setTheme] = useState(StorageHelper.getTheme());
  const [configured, setConfigured] = useState<boolean>(false);

  // trigger authentication state when needed
  useEffect(() => {
    (async () => {
      try {
        const result = await fetch("/aws-exports.json");
        const awsExports = await result.json();
        const currentConfig = Amplify.configure(awsExports) as AppConfig | null;
        
        try {
          const user = await Auth.currentAuthenticatedUser();
          if (user) {
            setAuthenticated(true);
          }
        } catch (authError) {
          // User is not authenticated - show custom login UI instead of redirecting
          console.log("User not authenticated, showing login page");
          setAuthenticated(false);
        }
        
        setConfig(awsExports);
        setConfigured(true);
      } catch (e) {
        // Configuration file failed to load
        console.error("Configuration error:", e);
        setError(true);
        setConfigured(true);
      }
    })();
  }, []);

  // Listen for auth state changes using Amplify Hub
  useEffect(() => {
    const hubListener = Hub.listen('auth', async ({ payload }) => {
      switch (payload.event) {
        case 'signIn':
        case 'tokenRefresh':
          setAuthenticated(true);
          break;
        case 'signOut':
          setAuthenticated(false);
          break;
        case 'signIn_failure':
          setAuthenticated(false);
          break;
      }
    });

    // Check initial auth state
    const checkAuthState = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        if (user) {
          setAuthenticated(true);
        }
      } catch (e) {
        setAuthenticated(false);
      }
    };
    
    if (configured) {
      checkAuthState();
    }

    return () => {
      hubListener();
    };
  }, [configured]);

  // dark/light theme
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const newValue =
            document.documentElement.style.getPropertyValue(
              "--app-color-scheme"
            );

          const mode = newValue === "dark" ? Mode.Dark : Mode.Light;
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
          <Alert header="Configuration error" type="error">
            Error loading configuration from "
            <a href="/aws-exports.json" style={{ fontWeight: "600" }}>
              /aws-exports.json
            </a>
            "
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
        <StatusIndicator type="loading">Loading</StatusIndicator>
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
        colorMode={theme === Mode.Dark ? "dark" : "light"}
      >
        <BrowserRouter>
          <AppLayoutContent
            authenticated={authenticated}
            configured={configured}
          />
        </BrowserRouter>
      </ThemeProvider>
    </AppContext.Provider>
  );
}

function AppLayoutContent({
  authenticated,
  configured,
}: {
  authenticated: boolean | null;
  configured: boolean;
}) {
  return (
    <>
      <BrandBanner />
      <MDSHeader showSignOut={authenticated === true} />
      {authenticated ? (
        <App />
      ) : configured ? (
        <AuthPage />
      ) : (
        <StatusIndicator type="loading">Loading</StatusIndicator>
      )}
      <FooterComponent />
    </>
  );
}
