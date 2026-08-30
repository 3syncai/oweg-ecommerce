import Link from "next/link";
import { Headphones, ShieldCheck, Timer } from "lucide-react";

type FaqItem = { q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const faqSections: FaqSection[] = [
  {
    title: "Order",
    items: [
      {
        q: "I missed the delivery of my order today. What should I do?",
        a: "The courier service delivering your order usually tries to deliver on the next business day in case you miss a delivery.\n\nYou can check your SMS for more details on when the courier service will try to deliver again.",
      },
      {
        q: "Will the delivery be tried again if I'm not able to collect my order the first time?",
        a: "Couriers make sure that the delivery is re-attempted the next working day if you can't collect your order the first time.",
      },
      {
        q: "The delivery of my order is delayed. What should I do?",
        a: "On the rare occasion that your order is delayed, please check your email & messages for updates. A new delivery timeframe will be shared with you and you can also track its status by visiting My Orders.",
      },
      {
        q: "What should I do if my order is approved but hasn't been shipped yet?",
        a: "We usually ship orders 1-2 business days before the delivery date so that they reach you on time. In case your order hasn't been shipped within this time please contact our Customer Support so that we can look into it.",
      },
      {
        q: "Can I take the shipment after opening and checking the contents inside?",
        a: "As per company policy, a shipment can't be opened before delivery, but you can accept the shipment and get in touch with us later in case you have any concerns.",
      },
      {
        q: "How do I know my order has been confirmed?",
        a: "An e-mail & SMS will be sent once you've successfully placed your order.",
      },
    ],
  },
  {
    title: "Cancellations and Returns",
    items: [
      {
        q: "If I request for a replacement, when will I get it?",
        a: "Visit My Orders to check the status of your replacement. In most locations, the replacement item is delivered to you at the time of pick-up. In all other areas, the replacement is initiated after the originally delivered item is picked up. Please check the SMS & email we send you for your replacement request for more details.",
      },
      {
        q: "Can items be returned after the time period mentioned in the Returns Policy?",
        a: "No, we will not be able to accept returns after the time period mentioned in the Returns Policy.",
      },
      {
        q: "Do I have to return the coins when I return a product?",
        a: "Yes, the coins have to be returned along with the product.",
      },
      {
        q: "How do returns work?",
        a: "You can raise a request to return your items with these simple steps:\n\n1. Log into your OWEG account\n\n2. Go to My Orders\n\n3. Click on 'Return' against the item you wish to return or exchange\n\n4. Fill in the details and raise a return request\n\nOnce you raise a request, you'll get an email and SMS confirming that your request is being processed. Based on the item, your request may be automatically approved or you may be contacted for more details. If the request is approved, the item will be picked up after which you will get a replacement or refund. You can also track the status of your return request instantly from the 'My Orders' section of your OWEG account.",
      },
      {
        q: "I see the 'Cancel' button but I can't click on it. Why?",
        a: "A 'Cancel' button can mean any one of the following:\n\n1. The item has been delivered already\n\nOR\n\n2. The item is non-refundable (e.g. Gift Vouchers)",
      },
    ],
  },
  {
    title: "Shopping",
    items: [
      {
        q: "Is installation offered for all products?",
        a: "Installation and demo are offered for certain items through the brand or an authorized service provider. Please check the individual product page to see if these services are offered for the item.",
      },
    ],
  },
];

const customerCareSupport = {
  title: "24x7 Customer Care Support",
  body: "You can access 24x7 Customer Care Support on the OWEG Help Centre. Any query or issue that you may possibly have while shopping on OWEG is taken care of here. This page is easy to navigate, and you can get support almost immediately. Once you log onto your OWEG account, this page shows you your recent orders and lets you report any issue. By clicking on the specific order, you can raise your query. It also has a chat option to ensure that your queries and issues are taken care of. Similarly, there are other options on this page that are created to assist you and to make your shopping experience hassle-free. You can get support any time and get a satisfactory solution to your queries and issues within minutes.",
};

function renderAnswer(text: string) {
  const parts = text.split(/(My Orders)/g);
  return parts.map((part, index) => {
    if (part === "My Orders") {
      return (
        <Link
          key={`my-orders-${index}`}
          href="/account/orders"
          className="font-medium text-emerald-700 hover:underline"
        >
          My Orders
        </Link>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

export default function FAQPage() {
  return (
    <div className="oweg-page min-h-screen text-[var(--oweg-ink)]">
      <div className="oweg-container max-w-5xl space-y-10 py-10 md:space-y-12 md:py-16">
        <header className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-4 py-1 text-xs font-semibold text-[var(--oweg-green-dark)]">
            <Headphones className="w-4 h-4" />
            FAQs & Support
          </div>
          <h1 className="oweg-title text-[clamp(1.6rem,1.1rem+2.4vw,2.5rem)]">Ask us anything before you plug in.</h1>
          <p className="oweg-subtle mx-auto max-w-3xl">
            Find answers about orders, returns, and shopping on OWEG. Need a human? Ping support from your profile—real people respond fast.
          </p>
        </header>

        <div className="space-y-10">
          {faqSections.map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="border-b border-[var(--oweg-border)] pb-2 text-lg font-semibold text-[var(--oweg-ink)] sm:text-xl">
                {section.title}
              </h2>
              <div className="grid gap-3 sm:gap-4">
                {section.items.map((item) => (
                  <div
                    key={item.q}
                    className="oweg-surface-card group px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-[var(--oweg-shadow-lg)] sm:px-5"
                  >
                    <p className="text-base font-semibold sm:text-lg">{item.q}</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--oweg-ink-muted)]">
                      {renderAnswer(item.a)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="space-y-4">
            <h2 className="border-b border-[var(--oweg-border)] pb-2 text-lg font-semibold text-[var(--oweg-ink)] sm:text-xl">
              {customerCareSupport.title}
            </h2>
            <div className="oweg-surface-card px-4 py-4 sm:px-5">
              <p className="text-sm leading-relaxed text-[var(--oweg-ink-muted)]">{customerCareSupport.body}</p>
            </div>
          </section>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-3 rounded-[var(--oweg-radius-xl)] bg-gradient-to-br from-[var(--oweg-green-dark)] via-[var(--oweg-green)] to-lime-400 p-5 text-white shadow-[var(--oweg-shadow-md)] sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              Priority Care
            </div>
            <h3 className="text-lg font-semibold sm:text-xl">Need escalation?</h3>
            <p className="text-sm text-white/90">
              Talk to the Priority Care team for warranty, installation, or delivery escalations.
            </p>
            <div className="break-all text-sm font-semibold">Email: owegonline@oweg.in</div>
          </div>
          <div className="oweg-surface-card space-y-3 p-5 sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--oweg-green-dark)]">
              <Timer className="w-4 h-4" />
              Quick chat
            </div>
            <h3 className="text-lg font-semibold text-[var(--oweg-ink)] sm:text-xl">Live help from profile</h3>
            <p className="text-sm text-[var(--oweg-ink-muted)]">
              Jump to Profile → Support to start a chat. We respond within minutes during 11:00 AM to 6:00 PM IST.
            </p>
            <div className="text-sm text-gray-700">Call: +91 8797787877</div>
          </div>
        </section>
      </div>
    </div>
  );
}
