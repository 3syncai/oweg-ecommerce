type Line = {variant_id?:unknown;quantity?:unknown};
/** Ignore line IDs, which differ between a draft order and its source cart. */
export function completedCheckoutCartMatches(orderItems:unknown,cartItems:unknown):boolean {
  const signature=(items:unknown)=>{
    if(!Array.isArray(items))return null;
    const quantities=new Map<string,number>();
    for(const item of items as Line[]){
      if(!item||typeof item.variant_id!=='string'||!item.variant_id||!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<=0)return null;
      quantities.set(item.variant_id,(quantities.get(item.variant_id)||0)+Number(item.quantity));
    }
    return JSON.stringify([...quantities].sort(([a],[b])=>a.localeCompare(b)));
  };
  const expected=signature(orderItems),current=signature(cartItems);
  return expected!==null&&current!==null&&expected===current;
}
