"use client";

interface RoundCardProps {
  scran: {
    id: number;
    imageUrl: string;
    name: string;
    description: string | null;
    price: number;
    icon: string;
    isSubscriberAtSubmit?: boolean | null;
  };
  onVote: () => void;
  isVoting: boolean;
  position: "left" | "right";
}

export function RoundCard({
  scran,
  onVote,
  isVoting,
  position,
}: RoundCardProps) {
  const borderClass =
    position === "left"
      ? "border-b-4 border-black md:border-b-0 md:border-r-4"
      : "";
  const isSvaga = scran.isSubscriberAtSubmit === true;

  return (
    <button
      onClick={onVote}
      disabled={isVoting}
      className={`group relative h-1/2 w-full overflow-hidden ${borderClass} disabled:cursor-default md:h-full md:w-1/2`}
      type="button"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={scran.imageUrl}
        alt={scran.name}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      <div
        className={`absolute bottom-0 left-0 right-0 p-2 sm:p-6 ${
          position === "left" ? "pb-8 sm:pb-6" : ""
        }`}
      >
        <div className="scran-frame relative flex w-full items-center gap-2 p-2 text-left sm:gap-4 sm:p-4">
          {isSvaga ? (
            <div className="absolute -left-3 -top-3 z-10">
              <div
                className="svaga-dish-badge pixel-text px-2 py-1 text-[10px] font-bold sm:text-xs"
                title="Блюдо от платного подписчика СВАГА+"
              >
                СВАГА+
              </div>
            </div>
          ) : null}

          <div className="absolute -right-3 -top-3 z-10">
            <div
              className="pixel-text px-2 py-1 text-xs font-bold sm:text-sm"
              style={{
                backgroundColor: "#ffcc00",
                border: "3px solid #aa8800",
                boxShadow: "3px 3px 0 rgba(0, 0, 0, 0.45)",
                color: "#ffffff",
                textShadow: "1px 1px 0 #888888",
              }}
            >
              {scran.price.toFixed(2)} ₽
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/sprites/${scran.icon}`}
            alt=""
            className="h-8 w-8 flex-shrink-0 object-cover sm:h-12 sm:w-12"
            style={{
              imageRendering: "pixelated",
              filter: "drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.6))",
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2
              className="pixel-text mb-0 text-sm font-bold sm:text-base"
              style={{ color: "#ffff55", textShadow: "2px 2px 0 #3f3f00" }}
            >
              {scran.name}
            </h2>
            {scran.description && (
              <p className="pixel-text line-clamp-1 text-[10px] text-white sm:line-clamp-2 sm:text-xs">
                {scran.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
