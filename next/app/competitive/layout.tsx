import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { Russo_One } from "next/font/google";

const russoOne = Russo_One({
  weight: "400",
  subsets: ["latin", "cyrillic"],
  variable: "--font-competitive-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Competitive — Бабабандл",
  description: "Соревновательный дейлик bebebendle",
};

type Props = Readonly<{
  children: ReactNode;
}>;

export default function CompetitiveLayout({ children }: Props): ReactElement {
  return <div className={russoOne.variable}>{children}</div>;
}
