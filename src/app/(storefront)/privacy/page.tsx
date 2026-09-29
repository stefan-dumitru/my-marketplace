export const metadata = {
  title: "Privacy Policy — My Marketplace",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB")}</p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <p>
          This policy describes what My Marketplace actually collects and does with your data. It
          is placeholder text reflecting the current implementation, not a substitute for review
          by a qualified lawyer before real users rely on it.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">1. What we collect</h2>
          <ul className="list-disc pl-5">
            <li>Account information: name, email, phone number (optional), password (stored as a
              salted hash, never in plain text).</li>
            <li>Shipping addresses you save or enter at checkout.</li>
            <li>Order history, including items purchased, amounts paid, and shipping/return
              status.</li>
            <li>Reviews you submit, and the associated purchase they&apos;re tied to.</li>
            <li>If you apply to become a seller: store name, business registration number, and
              any description or logo you provide.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">2. How we use it</h2>
          <p>
            To operate your account, process orders and payments, deliver order/shipping/return
            notifications by email and in-app, respond to support requests, and detect fraud or
            abuse (for example, rate-limiting repeated failed login attempts). We do not sell your
            personal data to third parties.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">3. Who we share it with</h2>
          <ul className="list-disc pl-5">
            <li><strong>Stripe</strong> — processes payments and seller payouts. Card details are
              entered directly on Stripe&apos;s hosted checkout page and never touch My
              Marketplace&apos;s own servers.</li>
            <li><strong>Resend</strong> — sends transactional emails (order confirmations,
              password resets, shipping updates, etc.).</li>
            <li><strong>Vercel Blob</strong> — stores product and seller images you or sellers
              upload.</li>
            <li>The seller(s) whose products you order receive your name, shipping address, and
              order contents, so they can fulfill the order.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">4. Cookies</h2>
          <p>
            We use one essential cookie to keep you signed in (httpOnly, secure, and scoped to
            this site — it cannot be read by other websites or by client-side scripts). We do not
            currently use advertising or third-party tracking cookies. Your light/dark theme
            preference is stored in your browser&apos;s local storage, not a cookie, and never
            leaves your device.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">5. How long we keep it</h2>
          <p>
            Account and profile data is kept while your account is active. If you delete your
            account, your personal information (name, email, phone, addresses) is anonymized —
            replaced with non-identifying placeholders — rather than deleted outright. Your past
            orders and invoices are retained after that, with personal details stripped, because
            we&apos;re required to keep financial records for tax and accounting purposes. Seller
            accounts cannot be deleted through self-service, since sellers have ongoing tax and
            payout obligations tied to their account.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">6. Your rights</h2>
          <p>
            You can review and update most of your information from your account page, including
            deleting your account (see above for what that does and doesn&apos;t remove). If
            you have questions about your data, contact support@my-marketplace.example.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">7. Changes</h2>
          <p>
            This policy may be updated as the platform changes. We&apos;ll update the date at the
            top of this page when that happens.
          </p>
        </section>
      </div>
    </div>
  );
}
