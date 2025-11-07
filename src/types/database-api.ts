/**
 * TypeScript types for Database API responses
 * Use these types for type-safe API calls in your frontend
 */

// ============================================================================
// Base Response Types
// ============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Pagination Types
// ============================================================================

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Product Types
// ============================================================================

export interface Product {
  id: string | number;
  title?: string;
  name?: string;
  description?: string;
  handle?: string;
  sku?: string;
  price?: number;
  stock?: number;
  quantity?: number;
  inventory_quantity?: number;
  category_id?: string | number;
  category?: string;
  images?: string;
  thumbnail?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any; // Allow additional fields from your database
}

// ============================================================================
// Tables API Response Types
// ============================================================================

export interface TableSchema {
  Field: string;
  Type: string;
  Null: 'YES' | 'NO';
  Key: string;
  Default: string | null;
  Extra: string;
}

export interface TableWithSchema {
  table: string;
  schema: TableSchema[] | null;
  error?: string;
}

export interface TablesResponse {
  success: true;
  count: number;
  tables: string[] | TableWithSchema[];
}

// ============================================================================
// Products API Response Types
// ============================================================================

export interface ProductsListData {
  products: Product[];
  pagination: Pagination;
  table: string;
}

export interface SingleProductData {
  [key: string]: any;
}

export interface ProductsByCategoryData {
  products: Product[];
  pagination: Pagination;
  table: string;
  relationTable: string | null;
}

export interface ProductSearchFilters {
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean | null;
}

export interface ProductSearchData {
  products: Product[];
  pagination: Pagination;
  searchQuery: string;
  filters: ProductSearchFilters;
  table: string;
}

export interface ProductStatistics {
  totalProducts: number;
  pricing: {
    min: number;
    max: number;
    average: number;
  };
  stock: {
    inStock: number;
    outOfStock: number;
  };
}

export interface CategoryDistribution {
  category_id: string;
  count: number;
}

export interface RecentProduct {
  id: string | number;
  title?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductStatsData {
  statistics: ProductStatistics;
  categoryDistribution: CategoryDistribution[];
  recentProducts: RecentProduct[];
  table: string;
}

// ============================================================================
// API Response Type Aliases
// ============================================================================

export type TablesApiResponse = TablesResponse | ApiErrorResponse;
export type ProductsListResponse = ApiResponse<ProductsListData>;
export type SingleProductResponse = ApiResponse<SingleProductData>;
export type ProductsByCategoryResponse = ApiResponse<ProductsByCategoryData>;
export type ProductSearchResponse = ApiResponse<ProductSearchData>;
export type ProductStatsResponse = ApiResponse<ProductStatsData>;

// ============================================================================
// Query Parameter Types
// ============================================================================

export interface ProductsQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  table?: string;
}

export interface ProductsByCategoryQueryParams {
  categoryId?: string | number;
  categoryName?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ProductSearchQueryParams {
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

// ============================================================================
// Helper Functions for Type Guards
// ============================================================================

export function isApiSuccess<T>(
  response: ApiResponse<T>
): response is ApiSuccessResponse<T> {
  return response.success === true;
}

export function isApiError<T>(
  response: ApiResponse<T>
): response is ApiErrorResponse {
  return response.success === false;
}

// ============================================================================
// API Client Helper Functions
// ============================================================================

/**
 * Helper function to build query string from parameters
 */
export function buildQueryString(
  params: Record<string, any>
): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Type-safe API fetch wrapper
 */
export async function fetchApi<T>(
  endpoint: string,
  params?: Record<string, any>
): Promise<ApiResponse<T>> {
  const queryString = params ? buildQueryString(params) : '';
  const response = await fetch(`${endpoint}${queryString}`);
  return await response.json();
}

// ============================================================================
// Usage Examples (commented out)
// ============================================================================

/*
// Example 1: Fetch products with type safety
const response: ProductsListResponse = await fetchApi<ProductsListData>(
  '/api/db/products',
  { limit: 20, offset: 0 }
);

if (isApiSuccess(response)) {
  const products = response.data.products;
  const pagination = response.data.pagination;
  console.log(products);
} else {
  console.error(response.error);
}

// Example 2: Search products
const searchResponse: ProductSearchResponse = await fetchApi<ProductSearchData>(
  '/api/db/products/search',
  { 
    q: 'laptop', 
    minPrice: 100, 
    maxPrice: 1000,
    inStock: true 
  }
);

// Example 3: Get product statistics
const statsResponse: ProductStatsResponse = await fetchApi<ProductStatsData>(
  '/api/db/products/stats'
);

if (isApiSuccess(statsResponse)) {
  const { statistics, categoryDistribution } = statsResponse.data;
  console.log(`Total products: ${statistics.totalProducts}`);
  console.log(`Average price: $${statistics.pricing.average}`);
}

// Example 4: Get single product
const productResponse = await fetch('/api/db/products/123');
const productData: SingleProductResponse = await productResponse.json();

// Example 5: React Hook Example
function useProducts(params: ProductsQueryParams) {
  const [data, setData] = useState<ProductsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<ProductsListData>('/api/db/products', params)
      .then(response => {
        if (isApiSuccess(response)) {
          setData(response.data);
        } else {
          setError(response.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params]);

  return { data, error, loading };
}
*/

