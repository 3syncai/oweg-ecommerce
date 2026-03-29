'use client'

import React from 'react'
import { RotateCcw, Wallet } from 'lucide-react'
import type { PinStatus } from '../types'

type DeliveryInfoProps = {
  pinCode: string
  pinStatus: PinStatus
  pinMessage: string
  onPinCodeChange: (value: string) => void
  onCheck: () => void
}

const DeliveryInfo = (_props: DeliveryInfoProps) => (
  <div className="space-y-4 rounded-3xl border border-[var(--detail-border)] bg-[#f8fbf8] p-5">
    <div className="flex items-start gap-3">
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
