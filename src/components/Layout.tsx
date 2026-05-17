import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" title="ModelPing">
          <span className="brand-logo">M</span>
          <span className="brand-text">ModelPing</span>
        </Link>
      </header>

      <main className="main-area">
        <Outlet />
      </main>
    </div>
  );
}
