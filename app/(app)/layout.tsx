import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex h-11 max-w-7xl items-center justify-between px-6">
          <Link href="/inject" className="font-mono text-xs text-ink">
            SIPPP <span className="text-neutral">/</span> Inject
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <span className="hidden text-muted sm:inline">
              {user.nama} <span className="text-neutral">· {user.userrole}</span>
            </span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </>
  );
}
