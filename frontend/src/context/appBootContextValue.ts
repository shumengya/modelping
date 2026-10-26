import { createContext } from "react";

export type AppBootContextValue = {
  signalBootReady: () => void;
};

export const AppBootContext = createContext<AppBootContextValue | null>(null);
