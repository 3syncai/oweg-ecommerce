/**
 * Clean Ghost Payment Collections
 * 
 * ROOT CAUSE: Each order has 2 payment_collections:
 * 1. Original cart PC (in PAISE, status=awaiting) - stale, never cancelled
 * 2. Razorpay capture PC (in RUPEES, status=completed) - correct
 * 
 * The PCs may be linked to DIFFERENT internal order_ids with the same display_id.
 * 
 * This script:
 * 1. Finds orders (by display_id) with multiple payment_collections
 * 2. For each, if there's a completed PC and an awaiting/authorized PC:
 *    - Marks the stale PC as 'canceled'
 *    - Removes the stale order_payment_collection link
 * 
 * The script is IDEMPOTENT and safe to run multiple times.
 * 
 * Run with: npx ts-node src/scripts/clean-ghost-payment-collections.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const lines: string[] = [];
function log(msg: string) {
    console.log(msg);
    lines.push(msg);
}

// Set to true to only preview changes, false to apply
const DRY_RUN = false;

async function cleanGhostPaymentCollections(): Promise<void> {
    log("\n=============================================================");
    log("🧹 CLEAN GHOST PAYMENT COLLECTIONS");
    log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify data)'}`);
    log("=============================================================\n");

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Stats
    let ordersAnalyzed = 0;
    let pcsCanceled = 0;
    let linksRemoved = 0;
    let alreadyClean = 0;
    let errors = 0;

    try {
        // Find all orders (by display_id) with multiple payment_collections
        // We group by display_id because PCs can be linked to different internal order_ids
        log("📋 Step 1: Finding orders with multiple payment_collections...\n");
        
        const multiPcRes = await pool.query(`
            SELECT o.display_id, 
                   COUNT(pc.id) as pc_count
            FROM "order" o
            JOIN order_payment_collection opc ON opc.order_id = o.id
            JOIN payment_collection pc ON pc.id = opc.payment_collection_id
            GROUP BY o.display_id
            HAVING COUNT(pc.id) > 1
            ORDER BY o.display_id DESC
        `);

        log(`Found ${multiPcRes.rows.length} orders with multiple payment_collections\n`);

        for (const order of multiPcRes.rows) {
            ordersAnalyzed++;
            const displayId = order.display_id;

            try {
                // Get all payment_collections for this display_id
                const pcRes = await pool.query(`
                    SELECT pc.id, pc.status, pc.amount, pc.captured_amount,
                           opc.id as link_id, opc.order_id, pc.created_at
                    FROM payment_collection pc
                    JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
                    JOIN "order" o ON o.id = opc.order_id
                    WHERE o.display_id = $1
                    ORDER BY pc.created_at ASC
                `, [displayId]);

                // Find completed PCs and stale (awaiting/authorized) PCs
                const completedPcs = pcRes.rows.filter((pc: any) => pc.status === 'completed');
                const stalePcs = pcRes.rows.filter((pc: any) => 
                    pc.status === 'awaiting' || pc.status === 'authorized' || pc.status === 'pending'
                );

                if (completedPcs.length > 0 && stalePcs.length > 0) {
                    log(`\n--- Order #${displayId} ---`);
                    log(`   Found ${completedPcs.length} completed PC(s) and ${stalePcs.length} stale PC(s)`);

                    // For each stale PC, cancel it and remove link
                    for (const stalePc of stalePcs) {
                        log(`   Stale PC: ${stalePc.id}`);
                        log(`      status: ${stalePc.status}`);
                        log(`      amount: ${stalePc.amount} (likely in paise)`);
                        log(`      link_id: ${stalePc.link_id}`);
                        
                        if (!DRY_RUN) {
                            // Update status to 'canceled'
                            await pool.query(`
                                UPDATE payment_collection 
                                SET status = 'canceled', updated_at = now()
                                WHERE id = $1
                            `, [stalePc.id]);
                            log(`   ✅ Set status to 'canceled'`);
                            
                            // Remove the order_payment_collection link
                            await pool.query(`
                                DELETE FROM order_payment_collection 
                                WHERE id = $1
                            `, [stalePc.link_id]);
                            log(`   ✅ Removed order_payment_collection link`);
                            
                            linksRemoved++;
                        } else {
                            log(`   [DRY RUN] Would cancel this PC and remove link`);
                        }
                        
                        pcsCanceled++;
                    }
                } else {
                    alreadyClean++;
                }

            } catch (orderError: any) {
                log(`\n--- Order #${displayId} ---`);
                log(`   ❌ Error: ${orderError.message}`);
                errors++;
            }
        }

        // Summary
        log("\n\n=============================================================");
        log("📊 CLEANUP SUMMARY");
        log("=============================================================");
        log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE'}`);
        log(`   Orders analyzed: ${ordersAnalyzed}`);
        log(`   Ghost PCs canceled: ${pcsCanceled}`);
        log(`   Links removed: ${linksRemoved}`);
        log(`   Already clean: ${alreadyClean}`);
        log(`   Errors: ${errors}`);
        log("=============================================================\n");

        if (DRY_RUN && pcsCanceled > 0) {
            log("💡 Run the script with DRY_RUN = false to apply changes.");
        } else if (!DRY_RUN && pcsCanceled > 0) {
            log("✅ Cleanup complete. Refresh Medusa Admin to verify.");
            log("   The 'Refund' display should now be gone for affected orders.");
        }

    } catch (error: any) {
        log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./clean_ghost_pcs_output.txt', lines.join('\n'));
        log('\n📝 Output written to: ./clean_ghost_pcs_output.txt');
    }
}

cleanGhostPaymentCollections();
