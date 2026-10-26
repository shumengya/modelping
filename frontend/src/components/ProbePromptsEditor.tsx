import { useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import common from "../styles/common.module.css";
import dialogStyles from "../styles/dialog.module.css";
import styles from "./ProbePromptsEditor.module.css";

/** 与 Worker 端解析规则一致：按行拆分、去首尾空白、丢弃空行（重复行保留，因为会影响抽中概率） */
function parsePrompts(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ProbePromptsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const inputId = useId();
  const dlgRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 正在修改的条目下标；null 表示正在添加 */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const prompts = parsePrompts(value);

  const openDialog = (index: number | null) => {
    setEditingIndex(index);
    setDraft(index === null ? "" : (prompts[index] ?? ""));
    dlgRef.current?.showModal();
    // showModal 默认聚焦第一个可聚焦元素（右上角 ×），这里改成直接聚焦输入框
    inputRef.current?.focus();
  };
  const closeDialog = () => dlgRef.current?.close();

  const commit = (next: string[]) => {
    onChange(next.join("\n"));
    closeDialog();
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 弹窗在 React 树里仍是外层「全局设置」表单的子孙，不拦住的话 submit 会冒泡触发保存
    e.stopPropagation();
    const text = draft.trim();
    if (!text) return;
    if (editingIndex === null) {
      commit([...prompts, text]);
      return;
    }
    if (text === prompts[editingIndex]) {
      closeDialog();
      return;
    }
    commit(prompts.map((p, i) => (i === editingIndex ? text : p)));
  };

  const remove = () => {
    if (editingIndex === null) return;
    commit(prompts.filter((_, i) => i !== editingIndex));
  };

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <span className={styles.label}>
          探测用语
          <span className={styles.count}>{prompts.length > 0 ? `${prompts.length} 条` : ""}</span>
        </span>
        <button type="button" className={`${common.btn} ${common.small}`} onClick={() => openDialog(null)}>
          添加
        </button>
      </div>
      <p className={styles.hint}>每次探测从中随机抽取一条发给模型；没有自定义用语时使用内置的简单问候语。</p>

      {prompts.length > 0 ? (
        <ul className={styles.list}>
          {prompts.map((p, i) => (
            <li key={`${i}-${p}`} className={styles.item}>
              <span className={styles.text}>{p}</span>
              <button type="button" className={`${common.btn} ${common.small}`} onClick={() => openDialog(i)}>
                修改
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>暂无自定义用语</p>
      )}

      {createPortal(
        <dialog ref={dlgRef} className={dialogStyles.probeDetailDialog}>
          <div className={dialogStyles.probeDetailInner}>
            <header className={dialogStyles.probeDetailHead}>
              <h3 className={dialogStyles.probeDetailTitle}>{editingIndex === null ? "添加探测用语" : "修改探测用语"}</h3>
              <button type="button" className={dialogStyles.probeDetailClose} aria-label="关闭" onClick={closeDialog}>
                ×
              </button>
            </header>
            <form className={styles.dialogForm} onSubmit={submit}>
              <label className={styles.dialogLabel} htmlFor={inputId}>
                内容
              </label>
              <input
                id={inputId}
                ref={inputRef}
                className={styles.input}
                value={draft}
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className={styles.dialogActions}>
                {editingIndex !== null ? (
                  <button
                    type="button"
                    className={`${common.btn} ${common.small} ${common.danger} ${styles.removeBtn}`}
                    onClick={remove}
                  >
                    删除
                  </button>
                ) : null}
                <button type="button" className={`${common.btn} ${common.ghost}`} onClick={closeDialog}>
                  取消
                </button>
                <button type="submit" className={`${common.btn} ${common.primary}`} disabled={!draft.trim()}>
                  保存
                </button>
              </div>
            </form>
          </div>
        </dialog>,
        document.body,
      )}
    </div>
  );
}
