import common from "../styles/common.module.css";
import styles from "./SplashScreen.module.css";

const APP_NAME = "ModelPing";

export function SplashScreen() {
  return (
    <div className={styles.splashScreen} role="status" aria-live="polite" aria-busy="true">
      <div className={`${styles.splashBgGlow} ${styles.splashBgGlowA}`} aria-hidden />
      <div className={`${styles.splashBgGlow} ${styles.splashBgGlowB}`} aria-hidden />

      <div className={styles.splashContent}>
        <div className={styles.splashLogoWrap}>
          <div className={styles.splashRings} aria-hidden>
            <span className={styles.splashRing} />
            <span className={styles.splashRing} />
            <span className={styles.splashRing} />
          </div>
          <img
            className={styles.splashLogo}
            src="/logo192.png"
            alt=""
            width={96}
            height={96}
            decoding="async"
            fetchPriority="high"
          />
        </div>

        <h1 className={styles.splashTitle}>{APP_NAME}</h1>
        <p className={styles.splashSubtitle}>加载中</p>

        <div className={styles.splashDots} aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>

      <span className={common.srOnly}>{APP_NAME} 正在加载</span>
    </div>
  );
}
