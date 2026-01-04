import { NextResponse } from 'next/server'
import axios from 'axios'

/**
 * Debug endpoint to check flash sale status
 * Accessible at: GET /api/medusa/flash-sale/debug
 */
export async function GET() {
  try {
    const backendUrl = process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
    const url = `${backendUrl}/store/flash-sale/debug`

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      validateStatus: () => true, // Don't throw on any status
    })

    if (response.status !== 200) {
      return NextResponse.json({
        error: `Backend returned ${response.status}: ${response.statusText}`,
        url,
      }, { status: 500 })
    }

    return NextResponse.json(response.data)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({
      error: errorMessage,
      ...(errorStack && { stack: errorStack }),
    }, { status: 500 })
  }
}

