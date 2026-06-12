import Image from "next/image"
import Link from "next/link"
import { LoginForm } from "@/components/login-form"

type LoginPageProps = {
  searchParams: Promise<{
    message?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { message } = await searchParams

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Image
            src="/shockproof-mark.svg"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full object-cover"
            priority
          />
          <span className="font-display font-extrabold">ShockProof</span>
        </Link>
        <LoginForm initialStatus={message ?? ""} />
      </div>
    </div>
  )
}
