import type { ReactElement } from "react";

export function RewardsCard(): ReactElement {
  return (
    <article className="c-rewards-card c-panel">
      <h3>Награды</h3>
      <div className="c-reward-content">
        <div className="c-reward-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/competitive/reward-badge.png" alt="Пример бейджа в чате" />
        </div>
        <p>
          Бейдж в чате
          <br />
          <span>(Twitch / СВАГА+) —</span>
          <strong>soon</strong>
        </p>
      </div>
    </article>
  );
}
