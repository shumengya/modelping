import "../splash.css";

const APP_NAME = "ModelPing";

export function SplashScreen() {
  return (
    <div className="splash-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="splash-bg-glow splash-bg-glow--a" aria-hidden />
      <div className="splash-bg-glow splash-bg-glow--b" aria-hidden />

      <div className="splash-content">
        <div className="splash-logo-wrap">
          <div className="splash-rings" aria-hidden>
            <span className="splash-ring" />
            <span className="splash-ring" />
            <span className="splash-ring" />
          </div>
          <img
            className="splash-logo"
            src="/logo192.png"
            alt=""
            width={96}
            height={96}
            decoding="async"
            fetchPriority="high"
          />
        </div>

        <h1 className="splash-title">{APP_NAME}</h1>
        <p className="splash-subtitle">加载中</p>

        <div className="splash-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>

      <span className="sr-only">{APP_NAME} 正在加载</span>
    </div>
  );
}
