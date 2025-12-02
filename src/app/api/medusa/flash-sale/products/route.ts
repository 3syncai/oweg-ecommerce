import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export async function GET() {
  try {
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
    const url = `${backendUrl}/store/flash-sale/products`
    
    // Get publishable key and sales channel ID like other routes
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || 
                          process.env.MEDUSA_PUBLISHABLE_KEY || 
                          process.env.MEDUSA_PUBLISHABLE_API_KEY
    const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || 
                          process.env.MEDUSA_SALES_CHANNEL_ID
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (publishableKey) {
      headers['x-publishable-api-key'] = publishableKey
    }
    if (salesChannelId) {
      headers['x-sales-channel-id'] = salesChannelId
    }
    
    console.log('[Flash Sale API] Fetching from backend:', url)
    console.log('[Flash Sale API] Headers:', { hasPublishableKey: !!publishableKey, hasSalesChannel: !!salesChannelId })
    
    const response = await axios.get(url, {
      headers,
      validateStatus: () => true, // Don't throw on any status
    })

    console.log('[Flash Sale API] Backend response status:', response.status, response.statusText)

    if (response.status !== 200) {
      console.error('[Flash Sale API] Backend error:', response.data)
      return NextResponse.json(
        { active: false, flash_sale: null, products: [] },
        { status: 200 } // Return empty instead of error
      )
    }

    const data = response.data
    console.log('[Flash Sale API] Backend data received:', {
      active: data.active,
      productsCount: data.products?.length || 0,
      hasFlashSale: !!data.flash_sale,
    })
    return NextResponse.json(data)
  } catch (error) {
    console.error('[Flash Sale API] Error fetching flash sale products:', error)
    return NextResponse.json(
      { active: false, flash_sale: null, products: [] },
      { status: 200 } // Return empty instead of error
    )
  }
}

