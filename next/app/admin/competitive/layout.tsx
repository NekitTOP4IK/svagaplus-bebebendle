import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";

type Props = Readonly<{ children: ReactNode }>;

/** Competitive admin pages require staff session. */
export default async function AdminCompetitiveLayout({
  children,
}: Props): Promise<ReactElement> {
  // This route depends on request cookies and must stay dynamic when the app
  // is prebuilt in CI without a user session.
  await connection();
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
