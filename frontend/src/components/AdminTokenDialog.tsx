import { useEffect, useRef, useState, type FormEvent } from "react";
import { adminPing } from "../api";
import { setAdminToken } from "../types";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

function pingErrorMessage(result: Exclude<Awaited<ReturnType<typeof adminPing>>, { ok: true }>): string {
  if (result.ok) return "";
  switch (result.reason) {
    case "not_configured":
      return "服务端未配置 ADMIN_TOKEN";
    case "unauthorized":
      return "Token 不正确";
    case "network":
      return "无法连接校验接口";
    default:
      return "校验失败";
  }
}

export function AdminTokenDialog({ onClose, onSuccess }: Props) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setErr("请输入 Token");
      return;
    }
    setBusy(true);
    setErr(null);
    const result = await adminPing(trimmed);
    setBusy(false);
    if (result.ok === true) {
      setAdminToken(trimmed);
      onSuccess();
      return;
    }
    setErr(pingErrorMessage(result));
  };

  return (
    <div
      className="modal-backdrop admin-token-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="modal admin-token-modal" onSubmit={(e) => void submit(e)} onClick={(e) => e.stopPropagation()}>
        <p className="modal-title admin-token-title">管理 Token</p>
        <input
          ref={inputRef}
          className="modal-input admin-token-input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token"
          autoComplete="off"
          disabled={busy}
        />
        {err ? <p className="modal-err">{err}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn ghost small" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn primary small" disabled={busy}>
            {busy ? "校验中…" : "进入"}
          </button>
        </div>
      </form>
    </div>
  );
}
