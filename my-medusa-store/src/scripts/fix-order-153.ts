
import { ensureOrderShippingMethod, ensureOrderReservations, ensureOrderProductShippingProfiles } from '../../src/lib/medusa-payment';
import "dotenv/config";

const ORDER_ID = 'order_01KC1Z736A5WCE34KKP1TYRV7B'; // From previous diagnosis

async function fixLatestOrder() {
    console.log(`🔧 Fixing Order ${ORDER_ID}...`);

    console.log('\n--- Step 1: Ensure Product Profiles ---');
    await ensureOrderProductShippingProfiles(ORDER_ID);

    console.log('\n--- Step 2: Ensure Shipping Method ---');
    await ensureOrderShippingMethod(ORDER_ID);

    console.log('\n--- Step 3: Ensure Reservations ---');
    await ensureOrderReservations(ORDER_ID);

    console.log('\n✅ Fix sequence complete.');
}

fixLatestOrder();
