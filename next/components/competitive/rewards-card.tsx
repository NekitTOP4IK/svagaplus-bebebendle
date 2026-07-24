import type { ReactElement } from "react";
import type { CompetitiveContentDoc } from "@/lib/competitive/content";

type Props = Readonly<{
  rewards: CompetitiveContentDoc;
}>;

export function RewardsCard({ rewards }: Props): ReactElement {
  const blocks = rewards.blocks;

  return (
    <article className="c-rewards-card c-panel">
      <h3>Награды</h3>
      {blocks.length === 0 ? (
        <div className="c-reward-content">
          <div className="c-reward-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/competitive/reward-badge.png"
              alt="Пример бейджа в чате"
            />
          </div>
          <p>
            Награды сезона
            <br />
            <span>появятся здесь —</span>
            <strong>soon</strong>
          </p>
        </div>
      ) : (
        <div className="c-content-blocks space-y-4 px-1 py-1">
          {blocks.map((block) => (
            <section key={block.id} className="c-content-block text-left">
              <h4 className="pixel-text mb-1 text-xs font-bold text-amber-100">
                {block.title}
              </h4>
              {block.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={block.imageUrl}
                  alt=""
                  className="mb-2 max-h-28 w-full object-contain"
                />
              ) : null}
              {block.body ? (
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/80">
                  {block.body}
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
