import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AppContext } from "./common/app-context";
import BrandBanner from "./components/brand-banner";
import GlobalHeader from "./components/global-header";
import Playground from "./pages/chatbot/playground/playground";
import DataPage from "./pages/admin/data-view-page";
import UserFeedbackPage from "./pages/admin/user-feedback-page";
import SessionPage from "./pages/chatbot/sessions/sessions";
import Welcome from "./pages/landing-page/basePage";
import Checklists from "./pages/requirements-gathering/checklist";
import DocumentEditor from "./pages/document-editor";
import DocEditorSessionsPage from "./pages/document-editor/doc-editor-sessions-page";
import Dashboard from "./pages/Dashboard";
import "./styles/app.scss";
import { Mode } from "@cloudscape-design/global-styles";
import { StorageHelper } from "./common/helpers/storage-helper";
import { useEffect, useState } from "react";

// Function to get brand banner height dynamically
const getBrandBannerHeight = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  if (bannerElement) {
    return bannerElement.getBoundingClientRect().height;
  }
  return 40; // Default fallback height
};

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Move focus to main content on route change for screen readers
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.setAttribute("tabindex", "-1");
      mainContent.focus();
      // Remove tabindex after focusing so it doesn't interfere with normal tab order
      setTimeout(() => mainContent.removeAttribute("tabindex"), 100);
    }
    
    // Update page title based on route
    const pageTitles: { [key: string]: string } = {
      "/": "GrantWell - Home",
      "/landing-page/basePage": "GrantWell - Home",
      "/dashboard": "Admin Dashboard - GrantWell",
      "/chatbot/sessions": "Chat Sessions - GrantWell",
      "/document-editor": "Document Editor - GrantWell",
    };
    
    const baseTitle = pageTitles[pathname] || "GrantWell";
    document.title = baseTitle;
  }, [pathname]);

  return null;
}

function App() {
  const Router = BrowserRouter;
  const [brandBannerHeight, setBrandBannerHeight] = useState<number>(40);
  const headerHeight = 56; // Height of GlobalHeader

  // Monitor brand banner height changes
  useEffect(() => {
    const updateBannerHeight = () => {
      const height = getBrandBannerHeight();
      setBrandBannerHeight(height);
    };

    // Initial measurement after a short delay to ensure banner is rendered
    const timer = setTimeout(updateBannerHeight, 100);

    // Watch for changes (e.g., when banner expands/collapses)
    const observer = new MutationObserver(updateBannerHeight);
    const bannerElement = document.querySelector(".ma__brand-banner");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Also listen for resize events
    window.addEventListener("resize", updateBannerHeight);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", updateBannerHeight);
    };
  }, []);

  return (
    <div style={{ height: "100%" }}>
      <Router>
        <ScrollToTop />
        {/* Skip Navigation Link for Accessibility */}
        <a
          href="#main-content"
          style={{
            position: "absolute",
            left: "-9999px",
            top: "0",
            zIndex: 10000,
            padding: "10px 20px",
            backgroundColor: "#0073bb",
            color: "#ffffff",
            textDecoration: "none",
            borderRadius: "4px",
            fontWeight: "600",
            fontSize: "16px",
          }}
          onFocus={(e) => {
            e.currentTarget.style.left = "10px";
            e.currentTarget.style.top = "10px";
          }}
          onBlur={(e) => {
            e.currentTarget.style.left = "-9999px";
          }}
        >
          Skip to main content
        </a>
        <BrandBanner />
        <GlobalHeader />
        <div
          style={{
            height: `${brandBannerHeight + headerHeight}px`,
            backgroundColor: "#FFFFFF",
          }}
        >
          &nbsp;
        </div>
        <main id="main-content" role="main">
          <Routes>
            <Route
              index
              path="/"
              element={<Navigate to={`/landing-page/basePage`} replace />} // root path
            />
            <Route path="/landing-page/basePage" element={<Outlet />}>
              <Route path="" element={<Welcome />} />
              {/* Route for the checklists page with a dynamic parameter */}
              <Route
                path="/landing-page/basePage/checklists/:documentIdentifier"
                element={<Checklists />}
              />
            </Route>
            <Route path="/chatbot" element={<Outlet />}>
              <Route path="playground/:sessionId" element={<Playground />} />
              <Route path="sessions" element={<SessionPage />} />
              <Route
                path="document-editor"
                element={<Navigate to="/document-editor" replace />}
              />
            </Route>
            {/* Document editor routes - use the new DocumentEditor component */}
            <Route path="/document-editor" element={<DocumentEditor />} />
            <Route path="/document-editor/:sessionId" element={<DocumentEditor />} />
            <Route path="/document-editor/drafts" element={<DocEditorSessionsPage />} />
            <Route path="/admin" element={<Outlet />}>
              <Route path="data" element={<DataPage />} />
              <Route path="user-feedback" element={<UserFeedbackPage />} />
            </Route>
            {/* Add Dashboard route */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="*"
              element={<Navigate to={`/landing-page/basePage`} replace />}
            />
          </Routes>
        </main>
      </Router>
    </div>
  );
}

export default App;
