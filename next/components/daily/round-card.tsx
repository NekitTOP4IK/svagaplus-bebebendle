"use client";

interface RoundCardProps {
  scran: {
    id: number;
    imageUrl: string;
    name: string;
    description: string | null;
    price: number;
  };
  onVote: () => void;
  isVoting: boolean;
  position: "left" | "right";
}

const targetUrls = [
  "Apple_1.14.png",
  "EggNew.png",
  "PumpkinPieNew.png",
  "BeetrootSoupNew.png",
  "EnchantedGoldenAppleNew.gif",
  "RabbitStewNew.png",
  "Beetroot_1.14.png",
  "GlisteringMelonNew.png",
  "RawBeefNew.png",
  "BreadNew.png",
  "GoldenAppleNew.png",
  "RawChickenNew.png",
  "BrownMushroomNew.png",
  "GoldenCarrotNew.png",
  "RawFish.png",
  "CakeNew.png",
  "Honey_Bottle.png",
  "RawPorkchopNew.png",
  "Carrot_Updated.png",
  "Kelp.png",
  "Raw_Mutton_new.png",
  "CocoaBeans.png",
  "MelonNew.png",
  "Raw_Rabbit.png",
  "CookedChickenNew.png",
  "MelonSliceNew.png",
  "RedMushroomNew.png",
  "CookedPorkchopNew.png",
  "MilkNew.png",
  "RottenFleshNew.png",
  "Cooked_Cod.png",
  "MushroomStewNew.png",
  "SpiderEyeNew.png",
  "Cooked_Mutton_new.png",
  "New_Baked_PotatoB.png",
  "SteakNew.png",
  "Cooked_Rabbit.png",
  "Poisonous_Potato_TextureUpdate.png",
  "SugarCaneItemNew.png",
  "CookieNew.png",
  "Potato_TextureUpdate.png",
  "SugarNew.png",
  "Dried_Kelp.png",
  "PumpkinNew.gif",
  "WheatNew.png",
];

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
  const targetUrl = targetUrls[scran.id % targetUrls.length];

  return (
    <button
      onClick={onVote}
      disabled={isVoting}
      className={`group relative h-1/2 w-full overflow-hidden ${borderClass} disabled:cursor-default md:h-full md:w-1/2`}
    >
      <img
        src={scran.imageUrl}
        alt={scran.name}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
        <div
          className="relative flex items-center gap-3 sm:gap-4 w-full text-left p-3 sm:p-4"
          style={{
            backgroundColor: "#1b1b1b",
            border: "6px solid #555555",
            boxShadow:
              "inset 6px 6px 0 #8b8b8b, inset -6px -6px 0 #1a1a1a, 0 0 0 3px #000000",
            imageRendering: "pixelated",
          }}
        >
          <div className="absolute -top-3 -right-3 z-10">
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

          <img
            src={`/sprites/${targetUrl}`}
            alt=""
            className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 object-cover"
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
              <p className="pixel-text line-clamp-2 text-[10px] text-white sm:text-xs">
                {scran.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
