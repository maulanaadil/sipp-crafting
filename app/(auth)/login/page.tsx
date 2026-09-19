import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "" } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">SIPPP</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Inject hasil pendampingan</h1>
          <p className="mt-1 text-sm text-zinc-600">Masuk dengan akun SIPPP. Hak akses mengikuti role yang ada.</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
