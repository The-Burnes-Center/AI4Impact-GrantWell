import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { AppContext } from "./common/app-context";
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

function App() {
  const Router = BrowserRouter;

  return (
    <div style={{ height: "100%" }}>
      <Router>
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
        <GlobalHeader />
        <div style={{ height: "56px", backgroundColor: "#FFFFFF" }}>&nbsp;</div>
        <main id="main-content">
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
