import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";

export default async function StorefrontLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header user={session ? { role: session.user.role } : null} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
