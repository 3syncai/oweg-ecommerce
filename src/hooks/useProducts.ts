/**
 * Custom React Hooks for Database API
 * Provides reusable hooks for fetching products and other data
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Product,
  ProductsListData,
  ProductStatsData,
  SingleProductData,
  ProductSearchData,
  isApiSuccess,
  ProductsQueryParams,
  ProductSearchQueryParams,
  buildQueryString,
} from '@/types/database-api';

// ============================================================================
// Hook Return Types
// ============================================================================

interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  pagination: {
    total: number;
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
  };
  refetch: () => void;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
}

interface UseProductResult {
  product: SingleProductData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseProductStatsResult {
  stats: ProductStatsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseProductSearchResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  pagination: {
    total: number;
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
  };
  search: (query: string) => void;
  setFilters: (filters: Partial<ProductSearchQueryParams>) => void;
  refetch: () => void;
  nextPage: () => void;
  prevPage: () => void;
}

// ============================================================================
// useProducts Hook - Fetch products with pagination
// ============================================================================

export function useProducts(
  initialParams: ProductsQueryParams = {}
): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const limit = initialParams.limit || 20;

  const fetchProducts = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);

    try {
      const params: ProductsQueryParams = {
        ...initialParams,
        offset: page * limit,
        limit,
      };

      const queryString = buildQueryString(params);
      const response = await fetch(`/api/db/products${queryString}`);
      const data = await response.json();

      if (isApiSuccess(data)) {
        const typedData = data.data as ProductsListData;
        setProducts(typedData.products);
        setTotal(typedData.pagination.total);
        setHasMore(typedData.pagination.hasMore);
        setCurrentPage(page);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [initialParams, limit]);

  useEffect(() => {
    fetchProducts(0);
  }, [fetchProducts]);

  const nextPage = useCallback(() => {
    if (hasMore) {
      fetchProducts(currentPage + 1);
    }
  }, [hasMore, currentPage, fetchProducts]);

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      fetchProducts(currentPage - 1);
    }
  }, [currentPage, fetchProducts]);

  const goToPage = useCallback((page: number) => {
    const totalPages = Math.ceil(total / limit);
    if (page >= 0 && page < totalPages) {
      fetchProducts(page);
    }
  }, [total, limit, fetchProducts]);

  const refetch = useCallback(() => {
    fetchProducts(currentPage);
  }, [currentPage, fetchProducts]);

  return {
    products,
    loading,
    error,
    pagination: {
      total,
      hasMore,
      currentPage,
      totalPages: Math.ceil(total / limit),
    },
    refetch,
    nextPage,
    prevPage,
    goToPage,
  };
}

// ============================================================================
// useProduct Hook - Fetch single product by ID
// ============================================================================

export function useProduct(id: string | number): UseProductResult {
  const [product, setProduct] = useState<SingleProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    if (!id) {
      setError('Product ID is required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/db/products/${id}`);
      const data = await response.json();

      if (isApiSuccess(data)) {
        setProduct(data.data as SingleProductData);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch product');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  return {
    product,
    loading,
    error,
    refetch: fetchProduct,
  };
}

// ============================================================================
// useProductStats Hook - Fetch product statistics
// ============================================================================

export function useProductStats(): UseProductStatsResult {
  const [stats, setStats] = useState<ProductStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/db/products/stats');
      const data = await response.json();

      if (isApiSuccess(data)) {
        setStats(data.data as ProductStatsData);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

// ============================================================================
// useProductSearch Hook - Advanced product search
// ============================================================================

export function useProductSearch(
  initialParams: ProductSearchQueryParams = {}
): UseProductSearchResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchParams, setSearchParams] = useState<ProductSearchQueryParams>(initialParams);

  const limit = initialParams.limit || 20;

  const fetchSearch = useCallback(async (page: number, params: ProductSearchQueryParams) => {
    if (!params.q && params.minPrice === undefined && params.maxPrice === undefined && params.inStock === undefined) {
      setProducts([]);
      setTotal(0);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchParams: ProductSearchQueryParams = {
        ...params,
        offset: page * limit,
        limit,
      };

      const queryString = buildQueryString(searchParams);
      const response = await fetch(`/api/db/products/search${queryString}`);
      const data = await response.json();

      if (isApiSuccess(data)) {
        const typedData = data.data as ProductSearchData;
        setProducts(typedData.products);
        setTotal(typedData.pagination.total);
        setHasMore(typedData.pagination.hasMore);
        setCurrentPage(page);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search products');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const search = useCallback((query: string) => {
    const newParams = { ...searchParams, q: query };
    setSearchParams(newParams);
    setCurrentPage(0);
    fetchSearch(0, newParams);
  }, [searchParams, fetchSearch]);

  const setFilters = useCallback((filters: Partial<ProductSearchQueryParams>) => {
    const newParams = { ...searchParams, ...filters };
    setSearchParams(newParams);
    setCurrentPage(0);
    fetchSearch(0, newParams);
  }, [searchParams, fetchSearch]);

  const nextPage = useCallback(() => {
    if (hasMore) {
      const nextPageNum = currentPage + 1;
      fetchSearch(nextPageNum, searchParams);
    }
  }, [hasMore, currentPage, searchParams, fetchSearch]);

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      const prevPageNum = currentPage - 1;
      fetchSearch(prevPageNum, searchParams);
    }
  }, [currentPage, searchParams, fetchSearch]);

  const refetch = useCallback(() => {
    fetchSearch(currentPage, searchParams);
  }, [currentPage, searchParams, fetchSearch]);

  useEffect(() => {
    if (initialParams.q || initialParams.minPrice !== undefined || initialParams.maxPrice !== undefined) {
      fetchSearch(0, searchParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    products,
    loading,
    error,
    pagination: {
      total,
      hasMore,
      currentPage,
      totalPages: Math.ceil(total / limit),
    },
    search,
    setFilters,
    refetch,
    nextPage,
    prevPage,
  };
}

// ============================================================================
// useProductsByCategory Hook - Fetch products by category
// ============================================================================

export function useProductsByCategory(
  categoryId?: string | number,
  categoryName?: string,
  limit: number = 20
): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchProducts = useCallback(async (page: number) => {
    if (!categoryId && !categoryName) {
      setError('Category ID or name is required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params: any = {
        offset: page * limit,
        limit,
      };

      if (categoryId) {
        params.categoryId = categoryId;
      } else if (categoryName) {
        params.categoryName = categoryName;
      }

      const queryString = buildQueryString(params);
      const response = await fetch(`/api/db/products/categories${queryString}`);
      const data = await response.json();

      if (isApiSuccess(data)) {
        const typedData = data.data as ProductsListData;
        setProducts(typedData.products);
        setTotal(typedData.pagination.total);
        setHasMore(typedData.pagination.hasMore);
        setCurrentPage(page);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [categoryId, categoryName, limit]);

  useEffect(() => {
    fetchProducts(0);
  }, [fetchProducts]);

  const nextPage = useCallback(() => {
    if (hasMore) {
      fetchProducts(currentPage + 1);
    }
  }, [hasMore, currentPage, fetchProducts]);

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      fetchProducts(currentPage - 1);
    }
  }, [currentPage, fetchProducts]);

  const goToPage = useCallback((page: number) => {
    const totalPages = Math.ceil(total / limit);
    if (page >= 0 && page < totalPages) {
      fetchProducts(page);
    }
  }, [total, limit, fetchProducts]);

  const refetch = useCallback(() => {
    fetchProducts(currentPage);
  }, [currentPage, fetchProducts]);

  return {
    products,
    loading,
    error,
    pagination: {
      total,
      hasMore,
      currentPage,
      totalPages: Math.ceil(total / limit),
    },
    refetch,
    nextPage,
    prevPage,
    goToPage,
  };
}

