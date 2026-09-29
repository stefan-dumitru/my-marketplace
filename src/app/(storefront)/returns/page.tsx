export const metadata = {
  title: "Returns Policy — My Marketplace",
};

export default function ReturnsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Returns Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB")}</p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <p>
          This describes how returns actually work on My Marketplace today. It is placeholder
          text, not a substitute for review by a qualified lawyer before real users rely on it —
          in particular, it does not yet reflect statutory consumer-protection return rights that
          may apply in your country.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">1. Before your order ships</h2>
          <p>
            An order cannot be cancelled by the buyer once placed. A seller can cancel their
            portion of an order any time before shipping it — if they do, any reserved stock is
            released and you&apos;re automatically refunded for that portion, with no action
            needed on your part.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">2. After your order is delivered</h2>
          <p>
            Once an item is marked delivered, you can request a return from that order&apos;s
            page. You&apos;ll be asked for a brief reason (at least 10 characters). You can
            request a return once per seller on a given order — a second request against the same
            seller portion isn&apos;t possible while one is already pending.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">3. What happens next</h2>
          <p>
            The seller who fulfilled that part of your order reviews the request and either
            approves or rejects it:
          </p>
          <ul className="list-disc pl-5">
            <li><strong>Approved</strong> — you&apos;re refunded automatically for that portion of
              the order via your original payment method, and the item is marked returned.</li>
            <li><strong>Rejected</strong> — no refund is issued, and the order stays marked
              delivered. You can contact the seller or My Marketplace support to discuss further.</li>
          </ul>
          <p>
            We don&apos;t currently enforce a fixed return-request deadline in the platform
            itself — sellers evaluate each request on its own terms, so we&apos;d encourage
            requesting a return as soon as you know you need one.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">4. Reviews aren&apos;t returns</h2>
          <p>
            Leaving a product review is separate from requesting a return — you can do either or
            both once an item is delivered, and one doesn&apos;t affect the other.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">5. Questions</h2>
          <p>
            If a seller hasn&apos;t responded to a return request or you believe it was handled
            unfairly, contact support@my-marketplace.example and we&apos;ll help mediate.
          </p>
        </section>
      </div>
    </div>
  );
}
