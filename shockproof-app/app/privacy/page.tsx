import Link from "next/link";

const sections = [
  ["Data we collect", "Account details, household setup, state/Discom, billing-cycle preferences, meter readings, uploaded meter videos, device permissions, app usage events, and support messages."],
  ["Why we use it", "To authenticate users, process meter videos, calculate tariff-slab risk, generate AI savings advice, send alerts, prevent abuse, and improve reliability."],
  ["AI processing", "Meter videos may be sent to AI providers for kWh extraction. Calculated usage and tariff variables may be sent to AI providers to generate localized advice."],
  ["Consent and control", "Users should be able to give, review, and withdraw consent for camera, notifications, video upload, and AI advice. Withdrawal may limit app features."],
  ["Retention", "Define how long raw videos, extracted readings, generated advice, logs, and account data are retained, and when they are deleted or anonymized."],
  ["Sharing", "Explain Supabase, AI model providers, hosting, analytics, support tools, and legal/compliance disclosures. State that data is not sold."],
  ["User rights", "Include access, correction, deletion, grievance redressal, consent withdrawal, and complaint escalation details under applicable Indian data protection law."],
  ["Security", "Mention encryption in transit, storage access controls, signed URLs, row-level security, audit logging, and least-privilege access."],
];

export default function PrivacyPage() {
  return (
    <main className="min-h-svh px-5 py-8 text-foreground">
      <article className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-card/75 p-6 shadow-2xl backdrop-blur-xl">
        <Link href="/dashboard" className="text-sm font-semibold text-accent">
          Back to dashboard
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">Privacy Policy</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This is a product-draft privacy outline for ShockProof. Have counsel
          review it before launch, especially for DPDP Act compliance.
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
