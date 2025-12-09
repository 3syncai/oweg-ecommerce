// src/scripts/fix-create-reservation.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    console.log(`=== Creating Missing Reservation for Order #149 Item ===`);

    // IDs from previous debug output
    const inventoryItemId = 'iitem_01KA3T0NQP4B38J2H3HTSP3GAK';
    const lineItemId = 'ordli_01KC1S1Z3CD77VKKFN7VQH5ME9';
    const locationId = 'sloc_01KA3VS3YKZWJF8KJ64GC2ZSS7';
    const quantity = 1;

    // Check if reservation already exists
    const checkRes = await pool.query(`
        SELECT id FROM reservation_item 
        WHERE line_item_id = $1
    `, [lineItemId]);

    if ((checkRes.rowCount || 0) > 0) {
        console.log('⚠️ Reservation already exists for this line item.');
        return;
    }

    const reservationId = `resitem_${randomUUID()}`;
    const rawQuantity = JSON.stringify({ value: String(quantity), precision: 20 });

    console.log(`Creating Reservation: ${reservationId}`);
    
    await pool.query(`
        INSERT INTO reservation_item (
            id, line_item_id, location_id, quantity, raw_quantity,
            inventory_item_id, allow_backorder, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, 
            $6, true, now(), now()
        )
    `, [reservationId, lineItemId, locationId, quantity, rawQuantity, inventoryItemId]);

    console.log(`✅ Successfully created reservation for line item.`);
    
    // Also update inventory level to reserve the quantity? 
    // Medusa might handle this, or we might need to manually update reserved_quantity in inventory_level.
    // Let's check inventory level first.
    const levelRes = await pool.query(`
        SELECT reserved_quantity FROM inventory_level 
        WHERE inventory_item_id = $1 AND location_id = $2
    `, [inventoryItemId, locationId]);
    
    if ((levelRes.rowCount || 0) > 0) {
        const currentReserved = Number(levelRes.rows[0].reserved_quantity);
        console.log(`Current Reserved Quantity: ${currentReserved}`);
        
        // We should theoretically increase this, but since we enabled backorder, maybe it's not strictly required 
        // for the fulfillment call to succeed. However, for correctness, let's bump it.
        await pool.query(`
            UPDATE inventory_level 
            SET reserved_quantity = reserved_quantity + $1, updated_at = now()
            WHERE inventory_item_id = $2 AND location_id = $3
        `, [quantity, inventoryItemId, locationId]);
        console.log(`✅ Updated inventory_level reserved_quantity.`);
    }

    await pool.end();
}

main().catch(console.error);
