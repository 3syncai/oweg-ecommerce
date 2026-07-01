import type { PolicyDocument } from "./types";

export const couponPolicy: PolicyDocument = {
  badge: "Coupon Code Policy",
  title: "Coupon Code Policy",
  description: "Rules and conditions for using coupon codes on OWEG.",
  sections: [
    {
      title: "Coupon rules",
      bullets: [
        "Coupons are valid for a limited time only. Oweg reserves the right to modify or cancel coupons at any time.",
        "If you do not purchase the qualifying items added to your Cart when the coupon is in effect, the discount will not apply.",
        "The coupon applies only to qualifying items displaying the coupon offer in your Coupon Book and on the item detail page.",
        "The coupon offer will not be valid until it is applied to the qualifying item.",
        "The coupon may only be used on www.oweg.in and in conjunction with the purchase of products shipped and sold by oweg.in and not on products sold by third-party sellers.",
        "The promotion is limited to one coupon per customer.",
        "Promotion may not be combinable with mail-in rebates.",
        "If you return any of the items purchased with a coupon, the coupon discount or value may be subtracted from the return credit.",
        "Applicable shipping and handling charges apply to all products.",
        "Add-on Items require a minimum purchase. See oweg.in for details.",
        "Offer good while supplies last.",
        "Void where prohibited.",
        "Oweg has no obligation for payment of any tax in conjunction with the distribution or use of any coupon.",
        "Consumer is required to pay any applicable sales tax related to the use of the coupon.",
        "Coupons are void if restricted or prohibited by law.",
      ],
    },
  ],
};
