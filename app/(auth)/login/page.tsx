import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "" } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 sm:px-10">
      <div className="font-mono text-xs text-muted">SIPPP / Inject</div>
      <div className="mt-16 grid gap-10 border-t border-rule pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">Masuk untuk menginject hasil pendampingan.</h1>
          <p className="mt-4 max-w-[36ch] text-sm leading-6 text-muted">
            Akun SIPPP yang sama. Yang bisa Anda inject mengikuti role dan pemda akun tersebut.
          </p>
        </div>
        <div className="max-w-sm">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
