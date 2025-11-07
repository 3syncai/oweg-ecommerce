import { NextRequest, NextResponse } from 'next/server';
import { executeReadQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/db/get/navigation
 * Get complete navigation tree (categories + subcategories)
 * Optimized single query for navbar
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const languageId = searchParams.get('language_id') || '1';

    // Get all categories in one query
    const query = `
      SELECT 
        c.category_id,
        c.parent_id,
        c.image,
        c.sort_order,
        c.status,
        cd.name,
        cd.description
      FROM oc_category c
      LEFT JOIN oc_category_description cd ON c.category_id = cd.category_id AND cd.language_id = ?
      WHERE c.status = 1
      ORDER BY c.parent_id ASC, c.sort_order ASC, cd.name ASC
    `;

    const allCategories = await executeReadQuery<any[]>(query, [languageId]);

    // Build hierarchical structure
    const categoryMap = new Map();
    const topLevelCategories: any[] = [];

    // First pass: create map of all categories
    allCategories.forEach(cat => {
      categoryMap.set(cat.category_id, { ...cat, subcategories: [] });
    });

    // Second pass: build hierarchy
    allCategories.forEach(cat => {
      if (cat.parent_id === 0) {
        // Top level category
        topLevelCategories.push(categoryMap.get(cat.category_id));
      } else {
        // Subcategory - add to parent
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.subcategories.push(categoryMap.get(cat.category_id));
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        categories: topLevelCategories,
      },
    });
  } catch (error) {
    console.error('Error fetching navigation:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch navigation',
      },
      { status: 500 }
    );
  }
}

