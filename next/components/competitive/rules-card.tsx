import type { ReactElement } from "react";

export function RulesCard(): ReactElement {
  return (
    <article className="c-rules-card c-panel">
      <h3>Правила — коротко</h3>
      <ul>
        <li>
          <span aria-hidden>◉◉</span>
          близкие пары
        </li>
        <li>
          <span aria-hidden>✦</span>
          умные очки
        </li>
        <li>
          <span className="c-red" aria-hidden>
            ⊘
          </span>
          пропуск = 0
        </li>
        <li>
          <span aria-hidden>⌛</span>
          24ч, без «кто раньше»
        </li>
        <li>
          <span className="c-gold" aria-hidden>
            ✦
          </span>
          +N за раунд
        </li>
      </ul>
    </article>
  );
}
