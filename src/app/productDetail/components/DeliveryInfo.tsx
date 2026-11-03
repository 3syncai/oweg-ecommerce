'use client'

import React from 'react'
import { MapPin, RotateCcw, Wallet } from 'lucide-react'
import Link from 'next/link'
import { FREE_SHIPPING_THRESHOLD_RUPEES, SHIPPING_CHARGE_RUPEES } from '@/lib/shipping-rules'
import type { PinStatus } from '../types'
import styles from '../ProductDetail.module.css'

type DeliveryInfoProps = {
  pinCode: string
  pinStatus: PinStatus
  pinMessage: string
  onPinCodeChange: (value: string) => void
  onCheck: () => void
}

const DeliveryInfo = ({ pinCode, pinStatus, pinMessage, onPinCodeChange, onCheck }: DeliveryInfoProps) => (
  <div className={styles.delivery}>
    <div style={{ gridColumn: '1 / -1' }} className="rounded-xl border border-slate-200 p-4 space-y-2">
      <h3 className="flex items-center gap-2 font-semibold"><MapPin size={18} aria-hidden /> Delivery & charges</h3>
      <form className="flex flex-col gap-2 min-[360px]:flex-row" onSubmit={event => { event.preventDefault(); onCheck() }}>
        <label className="sr-only" htmlFor="product-delivery-pin">Delivery pincode</label>
        <input id="product-delivery-pin" inputMode="numeric" autoComplete="postal-code" maxLength={6}
          value={pinCode} onChange={event => onPinCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Enter 6-digit pincode" className="min-h-11 w-full min-w-0 flex-1 rounded-lg border p-2 text-base" />
        <button type="submit" disabled={pinStatus === 'checking'} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-[#155344] px-3 py-2 text-sm text-white disabled:opacity-60">{pinStatus === 'checking' ? 'Checking…' : 'Check area'}</button>
      </form>
      <p role="status" aria-live="polite" className="text-sm text-slate-600">{pinMessage || 'Check your postal area. Courier availability and delivery estimate are confirmed at checkout when available.'}</p>
      <p className="text-sm">Shipping ₹{SHIPPING_CHARGE_RUPEES} for carts below ₹{FREE_SHIPPING_THRESHOLD_RUPEES}; free from ₹{FREE_SHIPPING_THRESHOLD_RUPEES}. Final order total appears before payment.</p>
    </div>
    <div className={styles.deliveryItem}>
      <RotateCcw className="w-6 h-6 text-green-600" />
      <div>
        <h3>Returns, replacement & warranty</h3>
        <p>Eligibility depends on the item and condition. Check the product description for manufacturer warranty.</p>
        <Link href="/returns-policy" className="text-sm underline">Read return conditions</Link>
      </div>
    </div>
    <div className={styles.deliveryItem}>
      <Wallet className="w-6 h-6 text-green-600" />
      <div>
        <h3>Cash on Delivery</h3>
        <p>Available where eligible. Confirm payment options for your address at checkout.</p>
      </div>
    </div>
  </div>
)

export default DeliveryInfo
