import { useContext } from "react";
import { AppBootContext, type AppBootContextValue } from "./appBootContextValue";

export function useAppBoot(): AppBootContextValue {
  const context = useContext(AppBootContext);
  if (!context) {
    throw new Error("useAppBoot must be used within AppBootProvider");
  }
  return context;
}
