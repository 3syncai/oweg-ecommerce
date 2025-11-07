import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/opencart/products/[id]
 * Fetch a single OpenCart product with all details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const languageId = searchParams.get('language_id') || '1';

    if (!id || !/^[0-9]+$/.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid product ID' },
        { status: 400 }
      );
    }

    // Get product with description
    const query = `
      SELECT 
        p.*,
        pd.name,
        pd.description,
        pd.tag,
        pd.meta_title,
        pd.meta_description,
        pd.meta_keyword
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
      WHERE p.product_id = ?
      LIMIT 1
    `;

    const result = await executeReadQuery<Array<Record<string, unknown>>>(query, [languageId, id]);

    if (!result || result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    const product = result[0];

    // Get product images
    const imagesQuery = `
      SELECT image, sort_order 
      FROM oc_product_image 
      WHERE product_id = ? 
      ORDER BY sort_order ASC
    `;
    const images = await executeReadQuery(imagesQuery, [id]);

    // Get product categories
    const categoriesQuery = `
      SELECT 
        c.category_id,
        cd.name as category_name
      FROM oc_product_to_category pc
      LEFT JOIN oc_category c ON pc.category_id = c.category_id
      LEFT JOIN oc_category_description cd ON c.category_id = cd.category_id AND cd.language_id = ?
      WHERE pc.product_id = ?
    `;
    const categories = await executeReadQuery(categoriesQuery, [languageId, id]);

    return NextResponse.json({
      success: true,
      data: {
        product,
        images,
        categories,
      },
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch product',
      },
      { status: 500 }
    );
  }
}

