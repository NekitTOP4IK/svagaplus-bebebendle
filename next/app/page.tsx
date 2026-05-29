import Image from "next/image";
import { GameActions } from "@/components/game-actions";
import { SocialLinks } from "@/components/social-links";
import { InfoButton } from "@/components/info-button";

export default function HomePage() {
  return (
    <div
      className="flex min-h-dvh items-start justify-center font-sans overflow-x-hidden"
      style={{
        backgroundImage: "url('/background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0" />
      <main className="relative z-10 flex flex-col items-center justify-start px-3 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 text-center pt-24 sm:pt-32 lg:pt-44 2xl:pt-56 4xl:pt-72 w-full max-w-[100vw]">
        {/* Hero Section */}
        <div className="mb-8 sm:mb-12 lg:mb-16 2xl:mb-20 w-full">
          <h1 className="mb-4 sm:mb-6 2xl:mb-8 animate-rotate">
            <Image
              src="/бебендл.webp"
              alt="бебендл"
              width={1303}
              height={319}
              className="h-auto w-[85vw] sm:w-[75vw] md:w-[70vw] lg:w-[65vw] xl:w-[60vw] 2xl:w-[55vw] 4xl:w-[50vw] max-w-[1000px] 2xl:max-w-[1400px] 4xl:max-w-[1800px] animate-title mx-auto"
              priority
            />
          </h1>
          <p className="pixel-text mb-4 sm:mb-6 2xl:mb-8 text-base sm:text-lg md:text-xl 2xl:text-2xl 4xl:text-3xl text-white max-w-[90%] sm:max-w-xl md:max-w-2xl 2xl:max-w-3xl 4xl:max-w-4xl mx-auto text-center leading-relaxed px-2">
            Scrandle по еде зрителей стримера Olesha, дарованный подписчиками платного тг-канала
          </p>
          <GameActions />
        </div>
      </main>
      <SocialLinks />
      <div className="fixed bottom-2 sm:bottom-4 left-2 sm:left-4 2xl:bottom-8 2xl:left-8 4xl:bottom-12 4xl:left-12 z-20">
        <InfoButton />
      </div>
    </div>
  );
}
