import { NextResponse } from 'next/server';
import { executeReadQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/products/stats
 * Get OpenCart product statistics
 */
export async function GET() {
  try {
    // Get comprehensive statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as totalProducts,
        MIN(price) as minPrice,
        MAX(price) as maxPrice,
        AVG(price) as avgPrice,
        SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) as inStockCount,
        SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END) as outOfStockCount,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as activeProducts,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactiveProducts,
        SUM(viewed) as totalViews
      FROM oc_product
    `;

    const stats = await executeReadQuery<Array<Record<string, unknown>>>(statsQuery);

    // Get top viewed products
    const topViewedQuery = `
      SELECT 
        p.product_id,
        p.model,
        p.viewed,
        p.price,
        pd.name
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = 1
      ORDER BY p.viewed DESC
      LIMIT 10
    `;
    const topViewed = await executeReadQuery(topViewedQuery);

    // Get recently added products
    const recentQuery = `
      SELECT 
        p.product_id,
        p.model,
        p.price,
        p.date_added,
        pd.name
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = 1
      ORDER BY p.date_added DESC
      LIMIT 10
    `;
    const recentProducts = await executeReadQuery(recentQuery);

    // Get category distribution
    const categoryQuery = `
      SELECT 
        c.category_id,
        cd.name as category_name,
        COUNT(pc.product_id) as product_count
      FROM oc_category c
      LEFT JOIN oc_category_description cd ON c.category_id = cd.category_id AND cd.language_id = 1
      LEFT JOIN oc_product_to_category pc ON c.category_id = pc.category_id
      GROUP BY c.category_id, cd.name
      HAVING product_count > 0
      ORDER BY product_count DESC
      LIMIT 20
    `;
    const categoryDistribution = await executeReadQuery(categoryQuery);

    const firstStat = stats[0] || {};
    
    return NextResponse.json({
      success: true,
      data: {
        statistics: {
          totalProducts: Number(firstStat.totalProducts) || 0,
          activeProducts: Number(firstStat.activeProducts) || 0,
          inactiveProducts: Number(firstStat.inactiveProducts) || 0,
          pricing: {
            min: parseFloat(String(firstStat.minPrice || '0')),
            max: parseFloat(String(firstStat.maxPrice || '0')),
            average: parseFloat((parseFloat(String(firstStat.avgPrice || '0'))).toFixed(2)),
          },
          stock: {
            inStock: Number(firstStat.inStockCount) || 0,
            outOfStock: Number(firstStat.outOfStockCount) || 0,
          },
          totalViews: Number(firstStat.totalViews) || 0,
        },
        topViewed,
        recentProducts,
        categoryDistribution,
      },
    });
  } catch (error) {
    console.error('Error fetching product stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch product statistics',
      },
      { status: 500 }
    );
  }
}

