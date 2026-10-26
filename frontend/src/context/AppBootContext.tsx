import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SplashScreen } from "../components/SplashScreen";
import { AppBootContext } from "./appBootContextValue";

const MIN_SPLASH_MS = 900;

export function AppBootProvider({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const bootReady = useRef(false);
  const startedAt = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const signalBootReady = useCallback(() => {
    if (bootReady.current) return;
    bootReady.current = true;
    const started = startedAt.current ?? Date.now();
    const delay = Math.max(0, MIN_SPLASH_MS - (Date.now() - started));
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
