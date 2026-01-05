'use client'

import React from 'react'
import { RotateCcw, Truck, Wallet } from 'lucide-react'
import type { PinStatus } from '../types'

type DeliveryInfoProps = {
  pinCode: string
  pinStatus: PinStatus
  pinMessage: string
  onPinCodeChange: (value: string) => void
  onCheck: () => void
}

const DeliveryInfo = ({ pinCode, pinStatus, pinMessage, onPinCodeChange, onCheck }: DeliveryInfoProps) => (
  <div className="space-y-4 rounded-3xl border border-[var(--detail-border)] bg-[#f8fbf8] p-5">
    <div className="flex items-start gap-3">
      <Truck className="w-6 h-6 text-green-600" />
      <div className="flex-1">
        <p className="font-semibold text-slate-900">Free Delivery</p>
        <p className="text-sm text-slate-500">Enter your postal code for delivery availability</p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={pinCode}
              onChange={(event) => onPinCodeChange(event.target.value)}
              type="text"
              maxLength={6}
              placeholder="Enter PIN code"
              className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
            />
            <button
              type="button"
              onClick={onCheck}
              className="rounded-full bg-green-600 px-4 py-2 text-white text-sm font-semibold"
            >
              Check
            </button>
          </div>
          {pinStatus !== 'idle' && (
            <p
              className={`text-sm ${
                pinStatus === 'available' ? 'text-green-600' : pinStatus === 'checking' ? 'text-slate-500' : 'text-red-500'
              }`}
            >
              {pinStatus === 'checking' ? 'Checking serviceability...' : pinMessage}
            </p>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-start gap-3 border-t border-dashed border-slate-200 pt-4">
      <RotateCcw className="w-6 h-6 text-green-600" />
      <div>
        <p className="font-semibold text-slate-900">Return Delivery</p>
        <p className="text-sm text-slate-500">7 days easy return & replacement on defects.</p>
      </div>
    </div>
    <div className="flex items-start gap-3 border-t border-dashed border-slate-200 pt-4">
      <Wallet className="w-6 h-6 text-green-600" />
      <div>
        <p className="font-semibold text-slate-900">Cash on Delivery</p>
        <p className="text-sm text-slate-500">Pay at your doorstep via cash or card.</p>
      </div>
    </div>
  </div>
)

export default DeliveryInfo
