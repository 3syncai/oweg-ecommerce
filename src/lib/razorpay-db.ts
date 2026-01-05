import { Pool } from 'pg';

/**
 * Save Razorpay payment to database
 */
export async function saveRazorpayPayment(payment: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  medusa_order_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_mode?: string;
  method?: string;
  email?: string;
  contact?: string;
  captured: boolean;
  fee?: number;
  tax?: number;
  error_code?: string;
  error_description?: string;
  notes?: Record<string, unknown>;
  webhook_received_at?: string;
  metadata?: Record<string, unknown>;
}) {
  console.log('🔵 Attempting to save payment:', payment.razorpay_payment_id);

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    return { success: false, error: 'DATABASE_URL not configured' };
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const query = `
      INSERT INTO razorpay_payment (
        razorpay_payment_id, razorpay_order_id, medusa_order_id,
        amount, currency, status, payment_mode, method, email, contact,
        captured, fee, tax, error_code, error_description, notes,
        webhook_received_at, created_at, updated_at, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, now(), now(), $18
      )
      ON CONFLICT (razorpay_payment_id) 
      DO UPDATE SET
        status = EXCLUDED.status,
        captured = EXCLUDED.captured,
        payment_mode = EXCLUDED.payment_mode,
        updated_at = now(),
        metadata = EXCLUDED.metadata
      RETURNING *;
    `;

    const values = [
      payment.razorpay_payment_id,
      payment.razorpay_order_id,
      payment.medusa_order_id,
      payment.amount,
      payment.currency,
      payment.status,
      payment.payment_mode || null,
      payment.method || null,
      payment.email || null,
      payment.contact || null,
      payment.captured,
      payment.fee || null,
      payment.tax || null,
      payment.error_code || null,
      payment.error_description || null,
      payment.notes ? JSON.stringify(payment.notes) : null,
      payment.webhook_received_at || new Date().toISOString(),
      payment.metadata ? JSON.stringify(payment.metadata) : null,
    ];

    const result = await pool.query(query, values);
    await pool.end();

    console.log('✅ Payment saved to razorpay_payment table:', payment.razorpay_payment_id);
    return { success: true, data: result.rows[0] };
  } catch (err) {
    await pool.end();
    console.error('❌ Failed to save payment to database:');
    console.error('Error details:', err);
    console.error('Payment data:', payment);
    return { success: false, error: String(err) };
  }
}

/**
 * Update order metadata to mark payment as captured
 * Medusa v2 doesn't have payment_status column - payment info is in metadata
 */
export async function updateOrderPaymentMetadata(orderId: string, _paymentData: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  amount: number;
  status: string;
}) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Update order metadata to include payment captured info
    const query = `
      UPDATE "order" 
      SET 
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{razorpay_payment_captured}',
          'true'::jsonb
        ),
        updated_at = now()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [orderId]);
    await pool.end();

    if (result.rows.length > 0) {
      console.log('✅ Order metadata updated with payment info:', orderId);
      return { success: true, data: result.rows[0] };
    } else {
      console.warn('⚠️ Order not found:', orderId);
      return { success: false, error: 'Order not found' };
    }
  } catch (err) {
    await pool.end();
    console.error('❌ Failed to update order metadata:', err);
    return { success: false, error: String(err) };
  }
}
