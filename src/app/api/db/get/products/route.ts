import { NextRequest, NextResponse } from 'next/server';
import {
  executeReadQuery,
  validatePagination,
  sanitizeLikePattern,
} from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/products
 * Fetch OpenCart products with proper JOINs
 * 
 * Query Parameters:
 * - limit: Number of records (default: 20, max: 100)
 * - offset: Number of records to skip (default: 0)
 * - search: Search in name/description/model/sku
 * - sortBy: product_id, price, quantity, date_added (default: product_id)
 * - sortOrder: ASC or DESC (default: DESC)
 * - language_id: Language ID (default: 1 for English)
 * - status: Filter by status (1=active, 0=inactive)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const { limit, offset } = validatePagination(
      searchParams.get('limit') || undefined,
      searchParams.get('offset') || undefined
    );

    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'product_id';
    const sortOrder = searchParams.get('sortOrder')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const languageId = searchParams.get('language_id') || '1';
    const status = searchParams.get('status');

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['product_id', 'price', 'quantity', 'date_added', 'date_modified', 'viewed', 'name'];
    if (!allowedSortFields.includes(sortBy)) {
      return NextResponse.json(
        { success: false, error: 'Invalid sortBy parameter' },
        { status: 400 }
      );
    }

    // Build the query with JOIN to get product name and description
    let query = `
      SELECT 
        p.product_id,
        p.model,
        p.sku,
        p.upc,
        p.price,
        p.quantity,
        p.image,
        p.status,
        p.viewed,
        p.date_added,
        p.date_modified,
        pd.name,
        pd.description,
        pd.meta_description,
        pd.meta_keyword
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
    `;

    const params: any[] = [languageId];

    // Build WHERE clause
    const whereClauses: string[] = [];

    if (search) {
      const sanitizedSearch = sanitizeLikePattern(search);
      whereClauses.push(`(
        pd.name LIKE ? OR 
        pd.description LIKE ? OR
        p.model LIKE ? OR
        p.sku LIKE ?
      )`);
      const searchPattern = `%${sanitizedSearch}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (status !== null && status !== undefined) {
      whereClauses.push('p.status = ?');
      params.push(status);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Add sorting
    const sortField = sortBy === 'name' ? 'pd.name' : `p.${sortBy}`;
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Execute query
    const products = await executeReadQuery(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT p.product_id) as total 
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
    `;
    const countParams: any[] = [languageId];
    
    if (whereClauses.length > 0) {
      const countWhere = whereClauses.join(' AND ');
      countQuery += ` WHERE ${countWhere}`;
      // Add the same search params (skip the language_id which is already added)
      if (search) {
        const sanitizedSearch = sanitizeLikePattern(search);
        const searchPattern = `%${sanitizedSearch}%`;
        countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }
      if (status !== null && status !== undefined) {
        countParams.push(status);
      }
    }

    const countResult = await executeReadQuery<any[]>(countQuery, countParams);
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
    console.error('Error fetching OpenCart products:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch products',
      },
      { status: 500 }
    );
  }
}

