import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery, validatePagination } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/get/categories
 * Fetch OpenCart categories
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { limit, offset } = validatePagination(
      searchParams.get('limit') || undefined,
      searchParams.get('offset') || undefined
    );
    const languageId = searchParams.get('language_id') || '1';
    const parentId = searchParams.get('parent_id');

    let query = `
      SELECT 
        c.category_id,
        c.image,
        c.parent_id,
        c.top,
        c.column as columns,
        c.sort_order,
        c.status,
        c.date_added,
        c.date_modified,
        cd.name,
        cd.description,
        cd.meta_title,
        cd.meta_description,
        cd.meta_keyword
      FROM oc_category c
      LEFT JOIN oc_category_description cd ON c.category_id = cd.category_id AND cd.language_id = ?
    `;

    const params: (string | number)[] = [languageId];

    if (parentId !== null && parentId !== undefined) {
      query += ` WHERE c.parent_id = ?`;
      params.push(parentId);
    }

    query += ` ORDER BY c.sort_order ASC, cd.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const categories = await executeReadQuery(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM oc_category`;
    const countParams: (string | number)[] = [];
    
    if (parentId !== null && parentId !== undefined) {
      countQuery += ` WHERE parent_id = ?`;
      countParams.push(parentId);
    }

    const countResult = await executeReadQuery<Array<{ total: number }>>(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      success: true,
      data: {
        categories,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch categories',
      },
      { status: 500 }
    );
  }
}

