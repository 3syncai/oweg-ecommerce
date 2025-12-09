import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function verify() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    const orderId = 'order_01KC069SE71GZ3714NQE741AZX';
    
    console.log('\n=== VERIFICATION ===\n');
    
    // Check transactions
    const txRes = await pool.query(
        'SELECT id, order_id, amount FROM order_transaction WHERE order_id = $1',
        [orderId]
    );
    
    console.log('OrderTransactions for order #129:');
    console.log('Found:', txRes.rows.length);
    txRes.rows.forEach(r => console.log('  -', JSON.stringify(r)));
    
    // Check order summary
    const summaryRes = await pool.query(
        `SELECT totals->>'paid_total' as paid_total, totals->>'transaction_total' as tx_total
         FROM order_summary WHERE order_id = $1`,
        [orderId]
    );
    
    if (summaryRes.rows.length > 0) {
        console.log('\nOrder Summary:');
        console.log('  paid_total:', summaryRes.rows[0].paid_total);
        console.log('  transaction_total:', summaryRes.rows[0].tx_total);
    }
    
    await pool.end();
}

verify();
