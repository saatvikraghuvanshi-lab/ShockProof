import Link from "next/link";

const sections = [
  ["Service scope", "ShockProof provides estimated tariff-risk insights from user-provided meter readings, selected Discom rules, and AI-generated guidance."],
  ["No billing guarantee", "The app is not an electricity board, Discom, or official bill issuer. Estimates may differ from final bills, taxes, fees, subsidies, arrears, and regulatory changes."],
  ["User responsibilities", "Users must provide accurate state, Discom, billing-cycle, and meter information, and must verify critical billing decisions with their Discom bill or official portal."],
  ["Camera and uploads", "Users are responsible for recording only their own meter and avoiding unrelated personal information in uploaded videos."],
  ["AI limitations", "AI extraction and advice can be wrong, incomplete, delayed, or affected by glare, blurry video, incorrect tariff data, or changing rules."],
  ["Account access", "Users are responsible for keeping device/passkey/Google access secure and for signing out on shared devices."],
  ["Acceptable use", "No misuse, reverse engineering, abusive uploads, illegal content, or attempts to access other users' readings or account data."],
  ["Liability and changes", "Limit liability for estimation errors, interruptions, data-entry mistakes, and third-party service outages. Reserve the right to update features and terms."],
];

export default function TermsPage() {
  return (
    <main className="min-h-svh px-5 py-8 text-foreground">
      <article className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-card/75 p-6 shadow-2xl backdrop-blur-xl">
        <Link href="/dashboard" className="text-sm font-semibold text-accent">
          Back to dashboard
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">Terms & Conditions</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This is a product-draft terms outline for ShockProof. Have counsel
          review it before launch, especially because tariff and AI outputs can
          affect household financial decisions.
        </p>
        <div className="mt-8 grid gap-5">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
