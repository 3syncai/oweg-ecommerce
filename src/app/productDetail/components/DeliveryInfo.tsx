'use client'

import React from 'react'
import { RotateCcw, Wallet } from 'lucide-react'
import type { PinStatus } from '../types'
import styles from '../ProductDetail.module.css'

type DeliveryInfoProps = {
  pinCode: string
  pinStatus: PinStatus
  pinMessage: string
  onPinCodeChange: (value: string) => void
  onCheck: () => void
}

const DeliveryInfo = (_props: DeliveryInfoProps) => (
  <div className={styles.delivery}>
    <div className={styles.deliveryItem}>
      <RotateCcw className="w-6 h-6 text-green-600" />
      <div>
        <h3>Return Delivery</h3>
        <p>7 days easy return & replacement on defects.</p>
      </div>
    </div>
    <div className={styles.deliveryItem}>
      <Wallet className="w-6 h-6 text-green-600" />
      <div>
        <h3>Cash on Delivery</h3>
        <p>Pay at your doorstep via cash or card.</p>
      </div>
    </div>
  </div>
)

export default DeliveryInfo
