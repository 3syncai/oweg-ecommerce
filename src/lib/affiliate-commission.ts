import { Pool } from "pg"

/**
 * Calculate affiliate commission for a product based on rules.
 * Priority: Product > Category > Collection
 * Returns 0 if no rule matches.
 */
export async function calculateAffiliateCommission(
    pool: Pool,
    productId: string,
    categoryIds: string[],
    collectionId: string | null,
    itemAmount: number
): Promise<{
    rate: number;
    amount: number;
    source: 'product' | 'category' | 'collection' | 'none';
    sourceId: string | null;
}> {
    try {
        // Priority 1: Product-specific commission
        const productResult = await pool.query(`
            SELECT commission_rate as rate
            FROM affiliate_commission
            WHERE product_id = $1
            LIMIT 1
        `, [productId])

        if (productResult.rows.length > 0) {
            const rate = parseFloat(productResult.rows[0].rate)
            return {
                rate,
                amount: (itemAmount * rate) / 100,
                source: 'product',
                sourceId: productId
            }
        }

        // Priority 2: Category-specific commission (check all categories)
        if (categoryIds && categoryIds.length > 0) {
            const categoryResult = await pool.query(`
                SELECT category_id, commission_rate as rate
                FROM affiliate_commission
                WHERE category_id = ANY($1)
                ORDER BY commission_rate DESC
                LIMIT 1
            `, [categoryIds])

            if (categoryResult.rows.length > 0) {
                const rate = parseFloat(categoryResult.rows[0].rate)
                return {
                    rate,
                    amount: (itemAmount * rate) / 100,
                    source: 'category',
                    sourceId: categoryResult.rows[0].category_id
                }
            }
        }

        // Priority 3: Collection-specific commission
        if (collectionId) {
            const collectionResult = await pool.query(`
                SELECT commission_rate as rate
                FROM affiliate_commission
                WHERE collection_id = $1
                LIMIT 1
            `, [collectionId])

            if (collectionResult.rows.length > 0) {
                const rate = parseFloat(collectionResult.rows[0].rate)
                return {
                    rate,
                    amount: (itemAmount * rate) / 100,
                    source: 'collection',
                    sourceId: collectionId
                }
            }
        }

        // No commission rule found
        return { rate: 0, amount: 0, source: 'none', sourceId: null }

    } catch (error) {
        console.error('[Commission] Error calculating commission:', error)
        return { rate: 0, amount: 0, source: 'none', sourceId: null }
    }
}

/**
 * Log affiliate commission for an order item
 */
export async function logAffiliateCommission(
    pool: Pool,
    data: {
        affiliateCode: string;
        orderId: string;
        customerId: string;
        productId: string;
        productName: string;
        variantId?: string;
        quantity: number;
        itemPrice: number;
        orderAmount: number;
        commissionRate: number;
        commissionAmount: number;
        commissionSource: string;
        categoryId?: string;
        collectionId?: string;
    }
): Promise<void> {
    try {
        // Get affiliate_user_id if exists
        const affiliateResult = await pool.query(`
            SELECT id FROM affiliate_user WHERE refer_code = $1
        `, [data.affiliateCode])

        const affiliateUserId = affiliateResult.rows[0]?.id || null

        await pool.query(`
            INSERT INTO affiliate_commission_log (
                affiliate_code,
                affiliate_user_id,
                order_id,
                customer_id,
                product_id,
                product_name,
                variant_id,
                quantity,
                item_price,
                order_amount,
                commission_rate,
                commission_amount,
                commission_source,
                category_id,
                collection_id,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING')
        `, [
            data.affiliateCode,
            affiliateUserId,
            data.orderId,
            data.customerId,
            data.productId,
            data.productName,
            data.variantId || null,
            data.quantity,
            data.itemPrice,
            data.orderAmount,
            data.commissionRate,
            data.commissionAmount,
            data.commissionSource,
            data.categoryId || null,
            data.collectionId || null
        ])

        console.log(`[Commission] Logged: ${data.commissionAmount.toFixed(2)} for ${data.productName} (${data.commissionSource})`)

    } catch (error) {
        console.error('[Commission] Error logging commission:', error)
        throw error
    }
}

/**
 * Update referral stats after an order
 */
export async function updateReferralStats(
    pool: Pool,
    affiliateCode: string,
    customerId: string,
    orderValue: number,
    commissionEarned: number
): Promise<void> {
    try {
        await pool.query(`
            UPDATE affiliate_referrals
            SET 
                total_orders = total_orders + 1,
                total_order_value = total_order_value + $3,
                total_commission = total_commission + $4,
                first_order_at = COALESCE(first_order_at, NOW())
            WHERE affiliate_code = $1 AND customer_id = $2
        `, [affiliateCode, customerId, orderValue, commissionEarned])

    } catch (error) {
        console.error('[Commission] Error updating referral stats:', error)
    }
}
