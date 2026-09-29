export const metadata = {
  title: "Terms of Service — My Marketplace",
};

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB")}</p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <p>
          This is placeholder legal text describing how My Marketplace operates today. It is not
          a substitute for review by a qualified lawyer before real users rely on it.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">1. What My Marketplace is</h2>
          <p>
            My Marketplace is a platform that connects independent sellers with buyers. Products
            are listed, priced, and fulfilled by third-party sellers, not by My Marketplace
            itself. My Marketplace provides the storefront, checkout, payment processing, and
            seller/buyer dispute tools, but is not the seller of record for any product.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">2. Accounts</h2>
          <p>
            You must provide accurate registration information and keep your password secure.
            Email verification is required before checkout or applying to sell. You are
            responsible for activity under your account. We may suspend an account for fraud,
            abuse, or violation of these terms; a suspension can be appealed by contacting
            support.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">3. Buying</h2>
          <p>
            Prices, stock, and product descriptions are set by individual sellers. Payment is
            processed by Stripe at checkout. An order confirmation does not guarantee
            availability — a seller can still cancel an unshipped order, in which case any amount
            already paid for that portion of the order is refunded automatically.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">4. Selling</h2>
          <p>
            Selling on the platform requires an approved seller application. Approved sellers are
            responsible for the accuracy of their listings, for fulfilling orders they accept, and
            for complying with applicable consumer-protection and tax law for the products they
            sell. My Marketplace reserves the right to reject or remove a listing, or to suspend a
            seller account, for violations of these terms. See our{" "}
            <a href="/returns" className="underline">
              Returns Policy
            </a>{" "}
            for how returns and refunds are handled between buyers and sellers.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">5. Reviews</h2>
          <p>
            Reviews may only be left by a buyer who purchased and received the specific item being
            reviewed. Reviews publish immediately. My Marketplace may remove a review that violates
            these terms (for example, if it is abusive, fraudulent, or unrelated to the product).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">6. Liability</h2>
          <p>
            My Marketplace is provided on an &quot;as is&quot; basis. To the extent permitted by
            law, My Marketplace is not liable for indirect or consequential damages arising from
            use of the platform, or for the acts or omissions of independent sellers.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">7. Changes</h2>
          <p>
            These terms may be updated from time to time. Continued use of the platform after a
            change constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">8. Contact</h2>
          <p>Questions about these terms can be sent to support@my-marketplace.example.</p>
        </section>
      </div>
    </div>
  );
}
