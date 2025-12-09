import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const outputFile = './order_inspection_result.txt';
const lines: string[] = [];

function log(msg: string) {
    console.log(msg);
    lines.push(msg);
}

async function inspectOrder() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Find the most recent orders
        log('\n=== FINDING RECENT ORDERS ===\n');
        
        const recentQuery = `
            SELECT id, display_id, status, currency_code, created_at
            FROM "order"
            ORDER BY created_at DESC
            LIMIT 10
        `;
        const recentRes = await pool.query(recentQuery);
        
        log('📋 Recent orders (newest first):');
        recentRes.rows.forEach((o, i) => {
            log(`  ${i+1}. Order #${o.display_id}: ${o.id}`);
            log(`     Created: ${o.created_at}, Status: ${o.status}`);
        });

        // Get the most recent order (likely the one with refund issue)
        if (recentRes.rows.length === 0) {
            log('No orders found!');
            fs.writeFileSync(outputFile, lines.join('\n'));
            return;
        }

        const order = recentRes.rows[0];
        log('\n=== INSPECTING MOST RECENT ORDER ===\n');
        log('📦 ORDER:');
        log('  ID: ' + order.id);
        log('  Display ID: ' + order.display_id);
        log('  Status: ' + order.status);
        log('  Currency: ' + order.currency_code);
        log('  Created: ' + order.created_at);

        // Get order_item columns first
        const columnsQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'order_item'
        `;
        const colRes = await pool.query(columnsQuery);
        log('\n📋 ORDER_ITEM columns: ' + colRes.rows.map(r => r.column_name).join(', '));

        // Get order items with correct columns
        const itemsQuery = `SELECT * FROM order_item WHERE order_id = $1`;
        const itemsRes = await pool.query(itemsQuery, [order.id]);
        
        log('\n📋 ORDER ITEMS:');
        itemsRes.rows.forEach(item => {
            log('  - Item: ' + JSON.stringify(item));
        });

        // Get payment collections
        const pcQuery = `
            SELECT pc.*
            FROM payment_collection pc
            INNER JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            WHERE opc.order_id = $1
        `;
        const pcRes = await pool.query(pcQuery, [order.id]);
        
        log('\n💳 PAYMENT COLLECTIONS:');
        pcRes.rows.forEach(pc => {
            log('  - ' + JSON.stringify(pc));
        });

        // Get payments
        const paymentQuery = `
            SELECT p.*
            FROM payment p
            WHERE p.payment_collection_id IN (
                SELECT opc.payment_collection_id FROM order_payment_collection opc WHERE opc.order_id = $1
            )
        `;
        const paymentRes = await pool.query(paymentQuery, [order.id]);
        
        log('\n💰 PAYMENTS:');
        paymentRes.rows.forEach(p => {
            log('  - ' + JSON.stringify(p));
        });

        // Get order transactions
        const txQuery = `SELECT * FROM order_transaction WHERE order_id = $1`;
        const txRes = await pool.query(txQuery, [order.id]);
        
        log('\n📝 ORDER TRANSACTIONS:');
        if (txRes.rows.length === 0) {
            log('  No transactions found');
        } else {
            txRes.rows.forEach(tx => {
                log('  - ' + JSON.stringify(tx));
            });
        }

        // Check refund table existence and content
        try {
            const refundQuery = `SELECT * FROM refund LIMIT 5`;
            const refundRes = await pool.query(refundQuery);
            log('\n🔄 REFUND TABLE (recent):');
            if (refundRes.rows.length === 0) {
                log('  No refund records in refund table');
            } else {
                refundRes.rows.forEach(r => {
                    log('  - ' + JSON.stringify(r));
                });
            }
        } catch (e) {
            log('\n🔄 REFUND TABLE: Does not exist or error: ' + String(e));
        }

        // Order Summary
        try {
            const summaryQuery = `SELECT * FROM order_summary WHERE order_id = $1`;
            const summaryRes = await pool.query(summaryQuery, [order.id]);
            log('\n📊 ORDER SUMMARY:');
            if (summaryRes.rows.length === 0) {
                log('  No order summary found');
            } else {
                log('  ' + JSON.stringify(summaryRes.rows[0]));
            }
        } catch (e) {
            log('\n📊 ORDER SUMMARY: Error: ' + String(e));
        }

        // Write to file
        fs.writeFileSync(outputFile, lines.join('\n'));
        log('\n✅ Output written to: ' + outputFile);

    } catch (error) {
        log('Error: ' + String(error));
        fs.writeFileSync(outputFile, lines.join('\n'));
    } finally {
        await pool.end();
    }
}

inspectOrder();
