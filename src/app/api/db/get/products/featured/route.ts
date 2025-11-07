import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery, validatePagination } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/products/featured
 * Get featured/top viewed products
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { limit, offset } = validatePagination(
      searchParams.get('limit') || undefined,
      searchParams.get('offset') || undefined
    );
    const languageId = searchParams.get('language_id') || '1';

    const query = `
      SELECT 
        p.product_id,
        p.model,
        p.sku,
        p.price,
        p.quantity,
        p.image,
        p.viewed,
        pd.name,
        pd.description
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
      WHERE p.status = 1
      ORDER BY p.viewed DESC
      LIMIT ? OFFSET ?
    `;

    const products = await executeReadQuery(query, [languageId, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM oc_product 
      WHERE status = 1
    `;
    const countResult = await executeReadQuery<any[]>(countQuery);
    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      success: true,
      data: { 
        products,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

