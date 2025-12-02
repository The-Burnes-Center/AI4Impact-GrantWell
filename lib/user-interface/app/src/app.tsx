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
import MDSHeader from "./components/mds-header";
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

// Function to get total header height (brand banner + global header + MDS header) dynamically
const getTotalHeaderHeight = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  const globalHeaderElement = document.querySelector(".awsui-context-top-navigation");
  const mdsHeaderElement = document.querySelector(".ma__header_slim");
  
  let bannerHeight = 40; // Default fallback
  let globalHeaderHeight = 56; // Default fallback
  let mdsHeaderHeight = 60; // Default fallback (typical MDS header height)
  
  if (bannerElement) {
    bannerHeight = bannerElement.getBoundingClientRect().height;
  }
  
  if (globalHeaderElement) {
    globalHeaderHeight = globalHeaderElement.getBoundingClientRect().height;
  }
  
  if (mdsHeaderElement) {
    mdsHeaderHeight = mdsHeaderElement.getBoundingClientRect().height;
  }
  
  return bannerHeight + globalHeaderHeight + mdsHeaderHeight;
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
  const [totalHeaderHeight, setTotalHeaderHeight] = useState<number>(156); // Default: 40px banner + 56px global header + 60px MDS header

  // Monitor all header heights changes
  useEffect(() => {
    const updateTotalHeight = () => {
      const height = getTotalHeaderHeight();
      setTotalHeaderHeight(height);
    };

    // Initial measurement after a short delay to ensure all headers are rendered
    const timer = setTimeout(updateTotalHeight, 100);

    // Watch for changes (e.g., when banner expands/collapses)
    const observer = new MutationObserver(updateTotalHeight);
    const bannerElement = document.querySelector(".ma__brand-banner");
    const globalHeaderElement = document.querySelector(".awsui-context-top-navigation");
    const mdsHeaderElement = document.querySelector(".ma__header_slim");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    if (globalHeaderElement) {
      observer.observe(globalHeaderElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    if (mdsHeaderElement) {
      observer.observe(mdsHeaderElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Also listen for resize events
    window.addEventListener("resize", updateTotalHeight);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", updateTotalHeight);
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
        <MDSHeader />
        <div
          style={{
            height: `${totalHeaderHeight}px`,
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
