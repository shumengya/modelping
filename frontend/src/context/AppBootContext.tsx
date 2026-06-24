import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SplashScreen } from "../components/SplashScreen";

const MIN_SPLASH_MS = 900;

type AppBootContextValue = {
  signalBootReady: () => void;
};

const AppBootContext = createContext<AppBootContextValue | null>(null);

export function AppBootProvider({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const bootReady = useRef(false);
  const startedAt = useRef(Date.now());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signalBootReady = useCallback(() => {
    if (bootReady.current) return;
    bootReady.current = true;
    const delay = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt.current));
    hideTimer.current = setTimeout(() => setShowSplash(false), delay);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const value = useMemo(() => ({ signalBootReady }), [signalBootReady]);

  return (
    <AppBootContext.Provider value={value}>
      {children}
      {showSplash ? <SplashScreen /> : null}
    </AppBootContext.Provider>
  );
}

export function useAppBoot(): AppBootContextValue {
  const ctx = useContext(AppBootContext);
  if (!ctx) {
    throw new Error("useAppBoot must be used within AppBootProvider");
  }
  return ctx;
}
