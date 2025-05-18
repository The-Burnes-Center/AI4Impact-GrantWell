import { useContext } from "react";
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
import GrantWellWelcome from "./pages/document-editor/GrantWellWelcome";
import ProjectBasics from "./pages/document-editor/ProjectBasics";
import QuickQuestionnaire from "./pages/document-editor/QuickQuestionnaire";
import DraftCreated from "./pages/document-editor/DraftCreated";
import SectionEditor from "./pages/document-editor/SectionEditor";
import DraftPreview from "./pages/document-editor/DraftPreview";
import ReviewApplication from "./pages/document-editor/ReviewApplication";
import Dashboard from "./pages/Dashboard";
import { useState } from "react";
import "./styles/app.scss";
import { Mode } from "@cloudscape-design/global-styles";
import { StorageHelper } from "./common/helpers/storage-helper";

function App() {
  const appContext = useContext(AppContext);
  const Router = BrowserRouter;
  const [theme, setTheme] = useState<Mode>(StorageHelper.getTheme());

  return (
    <div style={{ height: "100%" }}>
      <Router>
        <GlobalHeader />
        <div style={{ height: "56px", backgroundColor: "#FFFFFF" }}>&nbsp;</div>
        <div>
          <Routes>
            <Route
              index
              path="/"
              element={<Navigate to={`/landing-page/basePage`} replace />} // root path
            />
            <Route path="/landing-page/basePage" element={<Outlet />}>
              <Route path="" element={<Welcome theme={theme} />} />
              {/* <Route path="checklists/:documentUrl" element={<Checklists />} /> */}
              {/* Route for the checklists page with a dynamic parameter */}
              <Route
                // path="/landing-page/basePage/checklists/:documentUrl"
                // element={<Checklists />}
                path="/landing-page/basePage/checklists/:documentIdentifier"
                element={<Checklists />}
              />
            </Route>
            <Route path="/chatbot" element={<Outlet />}>
              <Route path="playground/:sessionId" element={<Playground />} />
              <Route path="sessions" element={<SessionPage />} />
              <Route
                path="document-editor"
                element={<GrantWellWelcome />}
              />
            </Route>
            {/* Document editor routes */}
            <Route path="/document-editor" element={<GrantWellWelcome />} />
            <Route path="/document-editor/project-basics" element={<ProjectBasics />} />
            <Route path="/document-editor/questionnaire" element={<QuickQuestionnaire />} />
            <Route path="/document-editor/draft-created" element={<DraftCreated />} />
            <Route path="/document-editor/section/:sectionIndex" element={<SectionEditor />} />
            <Route path="/document-editor/draft-preview" element={<DraftPreview />} />
            <Route path="/document-editor/review" element={<ReviewApplication />} />
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
        </div>
      </Router>
    </div>
  );
}

export default App;
