export default function ShippingPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            Shipping Policy
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Shipment status</h1>
        </header>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
          <p>
            We send email and SMS to you when the order is confirmed and when the order is shipped.
          </p>
          <p>
            You can check the status of your order from <a href="https://oweg.in/" className="text-emerald-600 hover:underline">https://oweg.in/</a>
          </p>
          <p>
            Most orders at Oweg get shipped within 1 to 3 days of confirmation. If your order was placed recently, please allow us time to procure and dispatch.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-gray-900">If your order is not shipped within 3 days of confirmation, we:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Inform you via email and SMS about the delay</li>
              <li>Work closely with the merchant to speed up the dispatch</li>
              <li>If it is possible we transfer the order to another merchant on Oweg.in</li>
              <li>If there are other reasons like your address not serviceable by our courier/delivery partners, we will get in touch with you for additional details.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
          <h2 className="font-semibold text-lg text-gray-900 block mb-2">Order is not yet shipped</h2>
          <p>
            You can check the status of your order from ShopClues.com My Account or from Oweg.in.
          </p>
          <p>
            Most orders at Oweg get shipped within 1 to 3 days of confirmation. If your order was placed recently, please allow us time to procure and dispatch.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-gray-900">If your order is not shipped within 3 days of confirmation, we:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Inform you via email and SMS about the delay</li>
              <li>Work closely with the merchant to speed up the procurement and dispatch</li>
              <li>If it is possible we transfer the order to another merchant on Oweg.in</li>
              <li>If there are other reasons like your address not serviceable by our courier partners, we will get in touch with you for additional details.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
          <h2 className="font-semibold text-lg text-gray-900 block mb-2">Order is in processing for more than 3 days</h2>
          <p>
            Please be assured that shipping your order on time is our highest priority. Within 24 hours of receiving the order, we initiate the pick-up process from the merchant.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-gray-900">If the process takes longer, we:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Inform you via email and SMS about the delay</li>
              <li>Work closely with the merchant to speed up the procurement and dispatch</li>
              <li>Transfer the order to another merchant or offer your alternate product options (from our catalog)</li>
              <li>If there are other reasons like your address not serviceable by our courier partners, we will get in touch with you for additional details.</li>
            </ul>
          </div>
          <p>
            In case the merchant is not able to timely fulfill the order and we are not able to find an alternative for you, we will cancel the order and refund your payment. Typically refund in the bank account takes upto 2 weeks after order cancellation.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-5 text-sm text-gray-700 leading-relaxed">
          <h2 className="font-semibold text-lg text-gray-900 block mb-2">Schedule the delivery</h2>
          
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">Schedule the day of dispatch:</h3>
            <p>
              If the order is not shipped, we can hold the order and ship it at your convenience. However, since Oweg is a marketplace, holding the shipment beyond a time would depend on merchant too.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">Schedule the time of delivery:</h3>
            <p>
              If the order is shipped, you can check the status at courier website and schedule the delivery by calling them.
            </p>
          </div>
        </section>

        <div className="mt-8 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
          <p className="font-semibold text-emerald-800 text-sm">
            All the Orders on Oweg is to be delievered within 2-3 days, as per their respective Location.
          </p>
        </div>
      </div>
    </div>
  );
}
