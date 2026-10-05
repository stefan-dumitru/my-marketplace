export type FaqLink = { label: string; href: string };
export type FaqTopic = { id: string; question: string; answer: string; links: FaqLink[] };

// Answers mirror what the site actually does (see /returns and the checkout/shipping code).
// Keep them factual and free of numbers that live elsewhere (fees, prices) — link to the source.
export const FAQ_TOPICS: FaqTopic[] = [
  {
    id: "track-order",
    question: "Where is my order?",
    answer:
      "Open My orders and select the order. Once the seller ships it, a Shipping Status card shows the tracking number and the latest status. It refreshes about every 2 hours, and we email you when the status changes.",
    links: [{ label: "My orders", href: "/orders" }],
  },
  {
    id: "cancel-order",
    question: "Can I cancel my order?",
    answer:
      "You can't cancel an order yourself once it's placed. A seller can cancel their part of an order any time before shipping it, and if they do you're refunded automatically for that part. If you need a change, send us a message.",
    links: [{ label: "Returns policy", href: "/returns" }],
  },
  {
    id: "return-item",
    question: "How do I return an item?",
    answer:
      "Once an item is marked delivered, open that order and request a return with a short reason. The seller approves or rejects it. If approved, you're refunded automatically to your original payment method.",
    links: [
      { label: "My orders", href: "/orders" },
      { label: "Returns policy", href: "/returns" },
    ],
  },
  {
    id: "shipping-cost",
    question: "How much is shipping?",
    answer:
      "Shipping is a flat fee per seller in your cart, shown at checkout before you pay. With the free-shipping subscription that fee is waived.",
    links: [{ label: "Free-shipping subscription", href: "/account/subscription" }],
  },
  {
    id: "refund",
    question: "When do I get my refund?",
    answer:
      "Approved refunds go back to the card you paid with, automatically. Your bank decides how long it takes to show up. If a seller rejected your return and you think that's wrong, send us a message.",
    links: [{ label: "Returns policy", href: "/returns" }],
  },
];
