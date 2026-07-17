import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";

type Props = Readonly<{
  children: ReactNode;
}>;

/** Scran detail and nested admin scran pages require staff session. */
export default async function AdminScransLayout({
  children,
}: Props): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
