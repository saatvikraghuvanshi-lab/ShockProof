"use client"

import Image from "next/image"
import Link from "next/link"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Image
            src="/shockproof-logo.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full object-cover"
            priority
          />
          <span className="font-display font-extrabold">ShockProof</span>
        </Link>
        <LoginForm />
      </div>
    </div>
  )
}
