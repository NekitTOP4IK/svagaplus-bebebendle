import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";

type Props = Readonly<{
  children: ReactNode;
}>;

/** Scran detail and nested admin scran pages require staff session. */
export default async function AdminScransLayout({
  children,
}: Props): Promise<ReactElement> {
  // This route depends on the request cookies and must never be prerendered
  // into an anonymous redirect during a build without runtime secrets/DB.
  await connection();
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
