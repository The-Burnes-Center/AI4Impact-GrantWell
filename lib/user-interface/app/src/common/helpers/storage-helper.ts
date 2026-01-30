import { NavigationPanelState } from "../types";

const PREFIX = "aws-genai-llm-chatbot";
const THEME_STORAGE_NAME = `${PREFIX}-theme`;
const SELECTED_MODEL_STORAGE_NAME = `${PREFIX}-selected-model`;
const SELECTED_WORKSPACE_STORAGE_NAME = `${PREFIX}-selected-workspace`;
const NAVIGATION_PANEL_STATE_STORAGE_NAME = `${PREFIX}-navigation-panel-state`;

export type ThemeMode = "light" | "dark";

export abstract class StorageHelper {
  static getTheme(): ThemeMode {
    const value = localStorage.getItem(THEME_STORAGE_NAME) ?? "light";
    const theme = value === "dark" ? "dark" : "light";

    return theme;
  }

  static applyTheme(theme: ThemeMode) {
    localStorage.setItem(THEME_STORAGE_NAME, theme);

    document.documentElement.style.setProperty(
      "--app-color-scheme",
      theme === "dark" ? "dark" : "light"
    );

    // Apply Bootstrap dark mode if needed
    if (theme === "dark") {
      document.documentElement.setAttribute("data-bs-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-bs-theme");
    }

    return theme;
  }

  static getNavigationPanelState(): NavigationPanelState {
    const value =
      localStorage.getItem(NAVIGATION_PANEL_STATE_STORAGE_NAME) ??
      JSON.stringify({
        collapsed: true,
      });

    let state: NavigationPanelState | null = null;
    try {
      state = JSON.parse(value);
    } catch {
      state = {};
    }

    return state ?? {};
  }

  static setNavigationPanelState(state: Partial<NavigationPanelState>) {
    const currentState = this.getNavigationPanelState();
    const newState = { ...currentState, ...state };
    const stateStr = JSON.stringify(newState);
    localStorage.setItem(NAVIGATION_PANEL_STATE_STORAGE_NAME, stateStr);

    return newState;
  }

  static getSelectedLLM() {
    const value = localStorage.getItem(SELECTED_MODEL_STORAGE_NAME) ?? null;

    return value;
  }

  static setSelectedLLM(model: string) {
    localStorage.setItem(SELECTED_MODEL_STORAGE_NAME, model);
  }

  static getSelectedWorkspaceId() {
    const value = localStorage.getItem(SELECTED_WORKSPACE_STORAGE_NAME) ?? null;

    return value;
  }

  static setSelectedWorkspaceId(workspaceId: string) {
    localStorage.setItem(SELECTED_WORKSPACE_STORAGE_NAME, workspaceId);
  }
}
