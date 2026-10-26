import { useRegisterSW } from "virtual:pwa-register/react";
import common from "../styles/common.module.css";
import styles from "./PwaUpdatePrompt.module.css";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className={styles.pwaUpdateBanner} role="alert">
      <p className={styles.pwaUpdateText}>发现新版本，更新后即可使用最新功能。</p>
      <div className={styles.pwaUpdateActions}>
        <button type="button" className={`${common.btn} ${common.ghost} ${common.small}`} onClick={() => setNeedRefresh(false)}>
          稍后
        </button>
        <button
          type="button"
          className={`${common.btn} ${common.primary} ${common.small}`}
          onClick={() => void updateServiceWorker(true)}
        >
          立即更新
        </button>
      </div>
    </div>
  );
}
