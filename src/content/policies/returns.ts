import type { PolicyDocument } from "./types";

export const returnsPolicy: PolicyDocument = {
  badge: "Returns Policy",
  title: "Return/Cancellation Policy",
  sections: [
    {
      title: "Return Policy",
      bullets: [
        "Please read all sections carefully to understand the conditions and cases under which returns will be accepted.",
        "Those who return any product may receive a replacement, exchange, or refund depending on the return outcome and original payment method. Refunds may be credited to your original payment source, Oweg Cash wallet, or as otherwise described in the Refund section below.",
        "Products are returnable within the applicable return window if you've received them in a condition that is physically damaged, has missing parts or accessories, defective or different from their description on the product detail page on oweg.in.",
        "If you report an issue with your Water purifier, Chimney, UPS inverter or Microwave, we may schedule a technician visit to your location.",
        "For products where installation is provided by the Company do not open the product packaging by yourself. Company's authorised personnel shall help in unboxing and installation of the product.",
        "Products may not be eligible for return in some cases, including cases of buyer's remorse such as incorrect model or color of product ordered or incorrect product ordered.",
        'Products marked as "non-returnable" on the product detail page cannot be returned.',
        "For refund if the product of your choice is unavailable in your preferred size or colour or model, or if it is out of stock, you may decide that you want your money back. In this scenario, you may choose Refund to have your money returned to you",
        "Please read all sections carefully to understand the conditions and cases under which returns will be accepted.",
      ],
    },
    {
      title: "Home Appliances",
      subsections: [
        {
          title: "Bottle, Lunchbox Ladder and clothes dryer, Mop, Scissors, UPS inverter / Batteries, Water purifier:",
          paragraphs: ["7 days from date of delivery", "Refund, Replacement or Exchange."],
          bullets: [
            "This item is eligible for free replacement or return within 7 days of delivery, in an unlikely event of damaged, defective or different item delivered to you.",
            "Please keep the item in its original condition, with brand outer box, MRP tags attached, user manual, warranty cards, and original accessories in manufacturer packaging for a successful return pick-up.",
            "For few products, we may schedule a technician visit to your location. On the basis of the technician's evaluation report, we will provide resolution.",
            "Non-Returnable: Select items labelled as non-returnable on the product detail page are not eligible for returns.",
          ],
        },
        {
          title: "Electric home appliances:",
          paragraphs: ["Mixer grinder, Induction, Emergency lamp LED, Iron, Roti maker, Toaster"],
        },
      ],
    },
    {
      title: "Kitchen Appliances",
      paragraphs: ["Fry pan, Handi, Kadai, knife, Pan, Pressure cooker, Sauce pan, Tava."],
      bullets: [
        "7 days return from date of delivery.",
        "Refund, Replacement or Exchange.",
        "This item is eligible for free replacement, within 7 days of delivery, in an unlikely event of damaged, defective or different item delivered to you.",
        "Please keep the item in its original condition, with brand outer box, MRP tags attached, user manual, warranty cards, and original accessories in manufacturer packaging for a successful return pick-up.",
      ],
    },
    {
      title: "UPS Inverter & Batteries",
      bullets: [
        "This item is non-returnable but it is a replaceable due to consumable nature of the product.",
        "It will be inspected by the engineers.",
        "However, in the unlikely event of damaged, defective or different item delivered to you, we will provide a full refund or free replacement as applicable. We may contact you to ascertain the damage or defect in the product prior to issuing refund/replacement.",
      ],
    },
    {
      title: "Water Purifier",
      bullets: [
        "This item is eligible for free replacement, within 7 days of delivery, in an unlikely event of damaged, defective or different item delivered to you.",
        "Please keep the item in its original condition, with brand outer box, user manual, warranty cards, and original accessories in manufacturer packaging for a successful return pick-up.",
        "We may contact you to ascertain the damage or defect in the product prior to issuing replacement.",
      ],
    },
    {
      title: "Computer Accessories",
      bullets: [
        "This item is eligible for free replacement, within 10 days of delivery, in an unlikely event of damaged, defective or different item delivered to you. Please keep the item in its original condition, with brand outer box, MRP tags attached, user manual, warranty cards, CDs and original accessories in manufacturer packaging for a successful return pick-up.",
        "For few products, we may schedule a technician visit to your location. On the basis of the technician's evaluation report, we will provide resolution.",
        "Non-Returnable: Select items labelled as non-returnable on the product detail page are not eligible for returns.",
      ],
    },
    {
      title: "Mobile Accessories",
      bullets: [
        "This item is eligible for free replacement, within 10 days of delivery, in an unlikely event of damaged, defective or different item delivered to you. Please keep the item in its original condition, with brand outer box, MRP tags attached, user manual, warranty cards, CDs and original accessories in manufacturer packaging for a successful return pick-up.",
        "For few products, we may schedule a technician visit to your location. On the basis of the technician's evaluation report, we will provide resolution.",
        "Non-Returnable: Select items labelled as non-returnable on the product detail page are not eligible for returns.",
      ],
    },
    {
      title: "Return (Reasons)",
      subsections: [
        {
          title: "Product purchased on oweg will be acceptable for returns if:",
          bullets: [
            "Dead on arrival (DOA)",
            "Defective",
            "Wrong product received",
            "Used Product/Broken Seal",
            "Physical damage",
          ],
        },
        {
          title: "Here are the reasons for which returns are not allowed:",
          bullets: [
            "Products that have already been used or installed.",
            "In case product is relocated from delivery address for installation / demonstration by customer, it would not be eligible for return",
            "Product you deem no longer in need or change of mind",
            "If the product has heating or any other issue at acceptable levels. In such cases, you can visit brand service centre to get your product checked.",
            "Return will not be accepted for subjective aspects like performance not as per expectation, colour shade difference etc.",
            "Dents, scratches on packaging not impacting the product performance do not qualify for returns",
            "Product becomes non-returnable if primary packaging is found open before installation.",
          ],
        },
      ],
    },
    {
      title: "Return approval process",
      bullets: [
        "You can raise a return request from My Account section of your oweg account.",
        "If you have purchased an electronic product, you will receive a call from our Returns Team within 2 business days of initiating a return request, to troubleshoot the issue you are facing.",
        "For Appliances, we will arrange a brand authorised technician visit to determine the issue within 5-6 business days. Return will be accepted if the technician confirms the issue in writing on a Job Sheet. Please retain a copy of Job Sheet as it will be needed by us to process the return request.",
        "For all Damaged/Wrong product received complaints you will be required to provide following to investigate further:",
        "Damaged/Wrong product: Images",
        "All sides of brand box",
        "Image of damaged part",
        "Our Returns Team will review the documents and pick-up will be arranged if the return reason complies with our policy and is approved by our Returns Team.",
      ],
    },
    {
      title: "Return (Pick-up)",
      bullets: [
        "We will pick-up your product as per below mentioned timelines once the return is approved",
        "Return pickup timelines: 5-7 business days.",
      ],
      subsections: [
        {
          title: "In case of Exchange:",
          paragraphs: [
            "Your order will be exchanged for a new identical product of a different size or color",
          ],
        },
        {
          title: "In case of replace:",
          paragraphs: [
            "The product in your order will be replaced with an identical product in case it is damaged (broken or spoiled) or defective (has a functional problem that causes it not to work).",
          ],
        },
      ],
    },
    {
      title: "Refund",
      bullets: [
        "We will take 48 hours to process the refund once the product has cleared the Quality Check. The refund amount will be credited to your bank account within 3-4 working days. In the case of certain public sector banks, it can take up to 10-15 working days.",
        "If you have paid via Cash on Delivery (COD), a refund will be credited to the bank account provided by you at the time of initiation of returns",
        "If you have paid using a credit/debit card or via net banking, the refund will be credited back to the account you used to place the original order.",
        "Amount paid through Oweg Cash will credited back to Oweg Cash account.",
        "Depending on the kind of product you wish to return, your return request may have to undergo a verification process following verification, you will be required to confirm your decision based on the category of product ordered.",
        "Keep ready all the requisite items necessary for a smooth returns process — including invoice, original packaging, price tags, freebies, accessories, etc.",
        "Pickup and Delivery of your order will be scheduled hand-in-hand in case of exchanges and replacements",
        "Refund will be initiated and processed if applicable",
        "Your request will be fulfilled according to Oweg returns/replacement guarantee.",
      ],
    },
  ],
};
