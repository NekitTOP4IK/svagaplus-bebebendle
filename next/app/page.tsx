import Image from "next/image";
import Link from "next/link";
import { DailyPlayButton } from "@/components/daily-play-button";
import { SocialLinks } from "@/components/social-links";
import { CountdownTimer } from "@/components/countdown-timer";
import { SplashText } from "@/components/splash-text";
import { HomeUserMenu } from "@/components/home-user-menu";
import { hasDailyForToday } from "@/app/daily/lib/get-daily-data";
import { getDailyPublicStatus } from "@/lib/app-settings";
import { getActiveAnnouncements } from "@/lib/announcements";
import { AnnouncementOverlay } from "@/components/announcements/announcement-overlay";
import { getCurrentUser } from "@/lib/auth-server";
export const dynamic = "force-dynamic";

const splashTexts = [
  "+7, братуха WW",
  "Теперь без ларперов",
  "Куда ты лезешь, калория?",
  "Скоро будет завоз",
  "Сюда! Сюда! Сюда!",
  "OMEGALUL",
  "Завтра BUGGIN",
  "Sveta_Kpop разбился насмерть",
  "Это просто пиздец",
  "Теперь для лошадей и котов",
  "Ну ты и бездарь",
  "ДАБЛЫДАБЛЫДАБЛЫ",
  "Окей, давайте спидранить!",
  "Цири не причастна",
  "Нажми /help в овсянке!",
  "Овсянка с томатами",
  "Ставь класс чтобы жалко!",
  "Там теперь ТАКОЕ",
  "+7 (800) 2000 122",
  "Бог покинул это место",
  "Теперь без инжира",
  "Карась. Карась.",
  "Бейкерам понравилось это!",
  "Стример любит этот чат <3",
  "Каждому пятому - бан!",
  "16 пенисов не прошло модерацию",
  "А Шульман что? ... ...",
  "Дней без завоза: ...",
  "WWWWWŴWWWWWWWWWWWWWWWWWWW",
  "LLLLLLLLLLLŁLLLLLLLLLLLLL",
  "Свечки были съедены",
  "Night in the woods",
  "Жаль ты не в Набережных Челнах",
  "Не все журналы можно сжечь",
  "The Elder Scrolls V: Skyrim",
  "",
  "Бутылка все еще под мостом",
  "Глеб?",
  "Подпишись на ggwp!",
  "Каша :)  Каша >:(",
  "Не откручивай гайку",
  "П..п.. п... Пенис",
  "СВАГА+",
  "你确定要来这里吗",
  "Это был Пудонг"
];

export default async function HomePage() {
  const hasDaily = await hasDailyForToday();
  const dailyStatus = await getDailyPublicStatus(hasDaily);
  const [announcements, user] = await Promise.all([getActiveAnnouncements(), getCurrentUser()]);

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
        <div className="relative mb-6 sm:mb-8 lg:mb-12 2xl:mb-16">
          <h1>
            <Image
              src="/бебендл.webp"
              alt="бебендл"
              width={1303}
              height={319}
              className="h-auto w-[85vw] max-w-[800px] sm:w-[70vw] lg:w-[55vw] 2xl:w-[45vw] 4xl:max-w-[1000px]"
              priority
            />
          </h1>
          <div className="absolute top-4/7 right-0 sm:-right-1/8">
            <SplashText texts={splashTexts} />
          </div>
        </div>

        <div className="flex w-full max-w-[320px] flex-col gap-2 overflow-visible sm:max-w-[400px] sm:gap-4 2xl:max-w-[480px] 2xl:gap-5 4xl:max-w-[560px]">
          <DailyPlayButton
            available={dailyStatus.available}
            unavailableReason={dailyStatus.reason}
          />
          <HomeUserMenu user={user} />
          <Link
            href="/competitive"
            className="relative block w-full overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            aria-label="Ranked — соревновательный дейлик"
          >
            <Image
              src="/ranked-button.webp"
              alt="Ranked"
              width={2000}
              height={448}
              className="h-auto w-full"
              priority={false}
            />
          </Link>

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

      <AnnouncementOverlay active={announcements} />
    </div>
  );
}
