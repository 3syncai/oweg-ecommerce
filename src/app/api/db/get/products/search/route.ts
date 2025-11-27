import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery, validatePagination, sanitizeLikePattern } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/products/search
 * Search products with filters
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const { limit, offset } = validatePagination(
      searchParams.get('limit') || undefined,
      searchParams.get('offset') || undefined
    );
    
    const search = searchParams.get('q') || '';
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const categoryId = searchParams.get('categoryId');
    const languageId = searchParams.get('language_id') || '1';

    let query = `
      SELECT 
        p.product_id,
        p.model,
        p.sku,
        p.price,
        p.quantity,
        p.image,
        p.status,
        pd.name,
        pd.description
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
    `;

    const params: (string | number)[] = [languageId];
    const whereClauses: string[] = [];

    if (categoryId) {
      query += ` INNER JOIN oc_product_to_category pc ON p.product_id = pc.product_id`;
      whereClauses.push('pc.category_id = ?');
      params.push(categoryId);
    }

    if (search) {
      const sanitized = sanitizeLikePattern(search);
      whereClauses.push('(pd.name LIKE ? OR pd.description LIKE ? OR p.model LIKE ? OR p.sku LIKE ?)');
      const pattern = `%${sanitized}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    if (minPrice) {
      whereClauses.push('p.price >= ?');
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      whereClauses.push('p.price <= ?');
      params.push(parseFloat(maxPrice));
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY p.product_id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const products = await executeReadQuery(query, params);

    // Count
    let countQuery = `SELECT COUNT(DISTINCT p.product_id) as total FROM oc_product p`;
    const countParams: (string | number)[] = [];

    if (categoryId) {
      countQuery += ` INNER JOIN oc_product_to_category pc ON p.product_id = pc.product_id`;
    }

    if (search || minPrice || maxPrice || categoryId) {
      countQuery += ` LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?`;
      countParams.push(languageId);
    }

    if (whereClauses.length > 0) {
      countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
      if (categoryId) countParams.push(categoryId);
      if (search) {
        const sanitized = sanitizeLikePattern(search);
        const pattern = `%${sanitized}%`;
        countParams.push(pattern, pattern, pattern, pattern);
      }
      if (minPrice) countParams.push(parseFloat(minPrice));
      if (maxPrice) countParams.push(parseFloat(maxPrice));
    }

    const countResult = await executeReadQuery<Array<{ total: number }>>(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      success: true,
      data: {
        products,
        pagination: { limit, offset, total, hasMore: offset + limit < total },
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

