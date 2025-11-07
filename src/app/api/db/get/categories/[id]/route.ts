import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/categories/[id]
 * Get single category with subcategories
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const languageId = searchParams.get('language_id') || '1';

    // Get category
    const categoryQuery = `
      SELECT 
        c.category_id,
        c.image,
        c.parent_id,
        c.top,
        c.sort_order,
        c.status,
        cd.name,
        cd.description,
        cd.meta_title,
        cd.meta_description
      FROM oc_category c
      LEFT JOIN oc_category_description cd ON c.category_id = cd.category_id AND cd.language_id = ?
      WHERE c.category_id = ?
    `;

    const category = await executeReadQuery<Array<Record<string, unknown>>>(categoryQuery, [languageId, id]);

    if (!category || category.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Category not found' },
        { status: 404 }
      );
    }

    // Get subcategories
    const subcategoriesQuery = `
      SELECT 
        c.category_id,
        c.image,
        c.sort_order,
        cd.name
      FROM oc_category c
      LEFT JOIN oc_category_description cd ON c.category_id = cd.category_id AND cd.language_id = ?
      WHERE c.parent_id = ? AND c.status = 1
      ORDER BY c.sort_order ASC
    `;

    const subcategories = await executeReadQuery(subcategoriesQuery, [languageId, id]);

    // Get product count
    const countQuery = `
      SELECT COUNT(*) as product_count
      FROM oc_product_to_category
      WHERE category_id = ?
    `;
    const countResult = await executeReadQuery<Array<{ product_count: number }>>(countQuery, [id]);

    return NextResponse.json({
      success: true,
      data: {
        category: category[0],
        subcategories,
        product_count: countResult[0]?.product_count || 0,
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

