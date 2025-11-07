import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery, validatePagination } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/products/special
 * Get products on special/discount
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
        ps.price as special_price,
        pd.name,
        pd.description
      FROM oc_product p
      INNER JOIN oc_product_special ps ON p.product_id = ps.product_id
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
      WHERE p.status = 1 
        AND ps.date_start <= NOW() 
        AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
      ORDER BY ps.priority ASC, ps.price ASC
      LIMIT ? OFFSET ?
    `;

    const products = await executeReadQuery(query, [languageId, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT p.product_id) as total
      FROM oc_product p
      INNER JOIN oc_product_special ps ON p.product_id = ps.product_id
      WHERE p.status = 1 
        AND ps.date_start <= NOW() 
        AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
    `;
    const countResult = await executeReadQuery<Array<{ total: number }>>(countQuery);
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

