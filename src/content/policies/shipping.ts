import type { PolicyDocument } from "./types";

export const shippingPolicy: PolicyDocument = {
  badge: "Shipping Policy",
  title: "Shipment status",
  sections: [
    {
      title: "Shipment status",
      paragraphs: [
        "We send email and SMS to you when the order is confirmed and when the order is shipped.",
        "You can check the status of your order from [your account](/account/orders).",
        "Most orders at Oweg get shipped within 1 to 3 days of confirmation. If your order was placed recently, please allow us time to procure and dispatch.",
      ],
      bullets: [
        "Inform you via email and SMS about the delay",
        "Work closely with the merchant to speed up the dispatch",
        "If it is possible we transfer the order to another merchant on Oweg.in",
        "If there are other reasons like your address not serviceable by our courier/delivery partners, we will get in touch with you for additional details.",
      ],
      subsections: [
        {
          title: "If your order is not shipped within 3 days of confirmation, we:",
        },
      ],
    },
    {
      title: "Order is not yet shipped",
      paragraphs: [
        "You can check the status of your order from [your OWEG account](/account/orders).",
        "Most orders at Oweg get shipped within 1 to 3 days of confirmation. If your order was placed recently, please allow us time to procure and dispatch.",
      ],
      bullets: [
        "Inform you via email and SMS about the delay",
        "Work closely with the merchant to speed up the procurement and dispatch",
        "If it is possible we transfer the order to another merchant on Oweg.in",
        "If there are other reasons like your address not serviceable by our courier partners, we will get in touch with you for additional details.",
      ],
      subsections: [
        {
          title: "If your order is not shipped within 3 days of confirmation, we:",
        },
      ],
    },
    {
      title: "Order is in processing for more than 3 days",
      paragraphs: [
        "Please be assured that shipping your order on time is our highest priority. Within 24 hours of receiving the order, we initiate the pick-up process from the merchant.",
        "In case the merchant is not able to timely fulfill the order and we are not able to find an alternative for you, we will cancel the order and refund your payment. Typically refund in the bank account takes upto 2 weeks after order cancellation.",
      ],
      bullets: [
        "Inform you via email and SMS about the delay",
        "Work closely with the merchant to speed up the procurement and dispatch",
        "Transfer the order to another merchant or offer your alternate product options (from our catalog)",
        "If there are other reasons like your address not serviceable by our courier partners, we will get in touch with you for additional details.",
      ],
      subsections: [
        {
          title: "If the process takes longer, we:",
        },
      ],
    },
    {
      title: "Schedule the delivery",
      subsections: [
        {
          title: "Schedule the day of dispatch:",
          paragraphs: [
            "If the order is not shipped, we can hold the order and ship it at your convenience. However, since Oweg is a marketplace, holding the shipment beyond a time would depend on merchant too.",
          ],
        },
        {
          title: "Schedule the time of delivery:",
          paragraphs: [
            "If the order is shipped, you can check the status at courier website and schedule the delivery by calling them.",
          ],
        },
      ],
    },
  ],
  footer: "All the orders on Oweg are to be delivered within 2-3 days, as per their respective location.",
};
