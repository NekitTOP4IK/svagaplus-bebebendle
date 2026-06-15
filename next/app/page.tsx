import Image from "next/image";
import { DailyPlayButton } from "@/components/daily-play-button";
import { SocialLinks } from "@/components/social-links";
import { CountdownTimer } from "@/components/countdown-timer";

export default function HomePage() {
  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-between overflow-hidden font-sans"
      style={{
        backgroundImage: "url('/background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <main className="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        <h1 className="mb-8 sm:mb-12 lg:mb-16 2xl:mb-20">
          <Image
            src="/бебендл.webp"
            alt="бебендл"
            width={1303}
            height={319}
            className="h-auto w-[85vw] max-w-[800px] sm:w-[70vw] lg:w-[55vw] 2xl:w-[45vw] 4xl:max-w-[1000px]"
            priority
          />
        </h1>

        <div className="flex w-full max-w-[320px] flex-col gap-2 sm:max-w-[400px] sm:gap-4 2xl:max-w-[480px] 2xl:gap-5 4xl:max-w-[560px]">
          <DailyPlayButton />
          <SocialLinks />
        </div>
      </main>

      <footer className="relative z-10 flex w-full items-end justify-between gap-4 px-3 pb-3 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
        <p className="pixel-text max-w-[45%] text-left text-[10px] leading-tight text-white/90 sm:text-xs md:text-sm 2xl:text-base 4xl:text-lg">
          Scrandle по еде зрителей стримера Olesha, дарованный подписчиками
          платного тг-канала
        </p>
        <div className="max-w-[45%]">
          <CountdownTimer />
        </div>
      </footer>
    </div>
  );
}
