/** Existing tier caps. Shipping can establish a tier but cannot be paid with coins. */
export function maxRedeemableCoins(orderTotal:number) {
  if(orderTotal<200)return 20;
  if(orderTotal<500)return 40;
  if(orderTotal<1000)return 60;
  if(orderTotal<1500)return 100;
  return 150;
}
export function eligibleCoinDiscount(input:{subtotal:number;shipping:number;otherDiscounts:number;balance:number}) {
  return Math.max(0,Math.min(input.balance,maxRedeemableCoins(input.subtotal+input.shipping),input.subtotal-input.otherDiscounts));
}
