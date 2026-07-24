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
        <div className="c-content-blocks px-1 py-1">
          {blocks.map((block) => (
            <section
              key={block.id}
              className={`c-content-block text-left${block.imageUrl ? " c-content-block--with-media" : ""}`}
            >
              <div className="c-content-block__head">
                <h4 className="c-content-block__title">{block.title}</h4>
                {block.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={block.imageUrl}
                    alt=""
                    className="c-content-block__media"
                  />
                ) : null}
              </div>
              {block.body ? (
                <p className="c-content-block__body">{block.body}</p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
