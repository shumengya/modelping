import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";

const RANDBG_ORIGIN = "https://randbg.smyhub.com";
const RANDBG_RANDOM_JSON = `${RANDBG_ORIGIN}/api/random?format=json&mode=desktop`;

function resolveRandBgUrl(raw: string): string {
  return /^https?:/i.test(raw) ? raw : new URL(raw, `${RANDBG_ORIGIN}/`).href;
}

export function Layout() {
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(RANDBG_RANDOM_JSON, { cache: "no-store" });
        if (!r.ok) throw new Error("randbg_status");
        const data = (await r.json()) as { url?: string };
        const u = typeof data.url === "string" ? data.url.trim() : "";
        if (!cancelled && u) {
          setBgUrl(resolveRandBgUrl(u));
          return;
        }
      } catch {
        /* fallback: 302 直链仍可作为 img src */
      }
      if (!cancelled) {
        setBgUrl(`${RANDBG_ORIGIN}/api/random?mode=desktop`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      {bgUrl ? (
        <img className="app-rand-bg" src={bgUrl} alt="" decoding="async" fetchPriority="low" />
      ) : null}
      <header className="topbar">
        <Link to="/" className="brand" title="ModelPing">
          <BrandLogo />
          <span className="brand-text">ModelPing</span>
        </Link>
      </header>

      <main className="main-area">
        <Outlet />
      </main>
    </div>
  );
}
