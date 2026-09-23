import { createContext } from "react";
import { AppConfig } from "./types/app";

export const AppContext = createContext<AppConfig | null>(null);
