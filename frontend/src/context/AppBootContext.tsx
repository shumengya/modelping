import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { AppBootContext } from "./appBootContextValue";

/** 启动画面至少存在到页面导航起 400ms，避免快速加载时一闪而过；慢网络下这个下限早已满足，不会额外等待。 */
const MIN_SPLASH_MS = 400;

/** 启动画面是 index.html 里的静态节点（JS 下载前就能绘制），就绪后直接移除。 */
function removeSplash(): void {
  document.getElementById("splash-screen")?.remove();
}

export function AppBootProvider({ children }: { children: ReactNode }) {
  const bootReady = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signalBootReady = useCallback(() => {
    if (bootReady.current) return;
    bootReady.current = true;
    // performance.now() 从导航开始计时，已经等得够久就立刻移除
    const delay = Math.max(0, MIN_SPLASH_MS - performance.now());
    hideTimer.current = setTimeout(removeSplash, delay);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const value = useMemo(() => ({ signalBootReady }), [signalBootReady]);

  return <AppBootContext.Provider value={value}>{children}</AppBootContext.Provider>;
}
