import { useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AdminTokenDialog } from "./AdminTokenDialog";
import styles from "./BrandLogo.module.css";

const LOGO_CLICKS = 5;
const LOGO_CLICK_WINDOW_MS = 2000;

export function BrandLogo() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const clicks = useRef({ count: 0, lastAt: 0 });

  const onLogoPointerDown = (e: PointerEvent<HTMLImageElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (now - clicks.current.lastAt > LOGO_CLICK_WINDOW_MS) {
      clicks.current.count = 0;
    }
    clicks.current.lastAt = now;
    clicks.current.count += 1;

    if (clicks.current.count >= LOGO_CLICKS) {
      clicks.current.count = 0;
      setDialogOpen(true);
    }
  };

  return (
    <>
      <img
        className={styles.brandLogo}
        src="/logo.png"
        alt=""
        width={40}
        height={40}
        decoding="async"
        onPointerDown={onLogoPointerDown}
      />
      {dialogOpen ? (
        <AdminTokenDialog
          onClose={() => setDialogOpen(false)}
          onSuccess={() => {
            setDialogOpen(false);
            window.dispatchEvent(new Event("modelping:admin-auth"));
            void navigate("/admin", { replace: true });
          }}
        />
      ) : null}
    </>
  );
}
