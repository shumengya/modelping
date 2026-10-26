import { useId } from "react";
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
  const fieldId = useId();
  const prompts = parsePrompts(value);

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <label className={styles.label} htmlFor={fieldId}>
          探测用语
        </label>
        <span className={styles.count}>{prompts.length > 0 ? `共 ${prompts.length} 条` : "使用内置用语"}</span>
      </div>
      <p className={styles.hint}>每行一条。每次探测会从中随机抽取一条发给模型；留空则使用内置的简单问候语。</p>

      <textarea
        id={fieldId}
        className={styles.textarea}
        rows={7}
        spellCheck={false}
        placeholder={"你好\nhello\nping"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className={styles.preview} aria-label="探测用语预览">
        {prompts.length > 0 ? (
          <ul className={styles.chips}>
            {prompts.map((p, i) => (
              <li key={`${i}-${p}`} className={styles.chip}>
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>还没有自定义用语，探测时将使用内置问候语</p>
        )}
      </div>
    </div>
  );
}
