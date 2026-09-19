import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/inject" className="font-semibold tracking-tight">
              SIPPP <span className="text-zinc-400">/</span> Inject
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600">
              {user.nama} <span className="text-zinc-400">· {user.userrole}</span>
            </span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
