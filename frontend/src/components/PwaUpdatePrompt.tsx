import { useRegisterSW } from "virtual:pwa-register/react";

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
    <div className="pwa-update-banner" role="alert">
      <p className="pwa-update-text">发现新版本，更新后即可使用最新功能。</p>
      <div className="pwa-update-actions">
        <button type="button" className="btn ghost small" onClick={() => setNeedRefresh(false)}>
          稍后
        </button>
        <button
          type="button"
          className="btn primary small"
          onClick={() => void updateServiceWorker(true)}
        >
          立即更新
        </button>
      </div>
    </div>
  );
}
