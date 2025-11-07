import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery, validatePagination } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/get/products/category/[id]
 * Get products by category ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
        p.status,
        p.viewed,
        pd.name,
        pd.description
      FROM oc_product p
      INNER JOIN oc_product_to_category pc ON p.product_id = pc.product_id
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
      WHERE pc.category_id = ?
      ORDER BY p.product_id DESC
      LIMIT ? OFFSET ?
    `;

    const products = await executeReadQuery(query, [languageId, id, limit, offset]);

    const countQuery = `
      SELECT COUNT(DISTINCT p.product_id) as total
      FROM oc_product p
      INNER JOIN oc_product_to_category pc ON p.product_id = pc.product_id
      WHERE pc.category_id = ?
    `;
    const countResult = await executeReadQuery<any[]>(countQuery, [id]);
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

