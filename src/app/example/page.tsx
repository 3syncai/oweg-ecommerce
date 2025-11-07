'use client';

import { useState, useEffect } from 'react';

interface Product {
  product_id: number;
  name: string;
  price: string;
  quantity: number;
  image: string;
  viewed?: number;
}

interface Category {
  category_id: number;
  name: string;
  parent_id: number;
  subcategories?: Category[];
}

interface Stats {
  totalProducts: number;
  activeProducts: number;
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

interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export default function ExamplePage() {
  const [activeTab, setActiveTab] = useState('products');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);

  // API endpoints to demonstrate
  const apiExamples = [
    { 
      id: 'products', 
      name: 'All Products', 
      endpoint: '/api/db/get/products?limit=10',
      description: 'Get paginated list of products'
    },
    { 
      id: 'product-single', 
      name: 'Single Product', 
      endpoint: '/api/db/get/products/1674',
      description: 'Get product details with images and categories'
    },
    { 
      id: 'search', 
      name: 'Search Products', 
      endpoint: '/api/db/get/products/search?q=pigeon&limit=10',
      description: 'Search products by keyword'
    },
    { 
      id: 'category-products', 
      name: 'Products by Category', 
      endpoint: '/api/db/get/products/category/59?limit=10',
      description: 'Get products in Home Appliances category'
    },
    { 
      id: 'featured', 
      name: 'Featured Products', 
      endpoint: '/api/db/get/products/featured?limit=10',
      description: 'Get top viewed/featured products'
    },
    { 
      id: 'latest', 
      name: 'Latest Products', 
      endpoint: '/api/db/get/products/latest?limit=10',
      description: 'Get recently added products'
    },
    { 
      id: 'special', 
      name: 'Special/Sale Products', 
      endpoint: '/api/db/get/products/special?limit=10',
      description: 'Get products on discount'
    },
    { 
      id: 'stats', 
      name: 'Product Statistics', 
      endpoint: '/api/db/get/products/stats',
      description: 'Get analytics and statistics'
    },
    { 
      id: 'categories', 
      name: 'All Categories', 
      endpoint: '/api/db/get/categories?limit=20',
      description: 'Get list of categories'
    },
    { 
      id: 'category-single', 
      name: 'Single Category', 
      endpoint: '/api/db/get/categories/59',
      description: 'Get category with subcategories'
    },
    { 
      id: 'navigation', 
      name: 'Navigation Tree', 
      endpoint: '/api/db/get/navigation',
      description: 'Get complete navigation structure'
    },
  ];

  const fetchData = async (endpoint: string) => {
    setLoading(true);
    try {
      const response = await fetch(endpoint);
      const result = await response.json();
      setData(result);
    } catch {
      setData({ success: false, error: 'Failed to fetch data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const example = apiExamples.find(e => e.id === activeTab);
    if (example) {
      fetchData(example.endpoint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const currentExample = apiExamples.find(e => e.id === activeTab);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '10px' }}>🚀 OpenCart Database API Demo</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Interactive demonstration of all available APIs
      </p>

      {/* API Selector Tabs */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '10px', 
        marginBottom: '20px',
        borderBottom: '2px solid #e0e0e0',
        paddingBottom: '10px'
      }}>
        {apiExamples.map(example => (
          <button
            key={example.id}
            onClick={() => setActiveTab(example.id)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              backgroundColor: activeTab === example.id ? '#007bff' : '#f0f0f0',
              color: activeTab === example.id ? 'white' : '#333',
              fontWeight: activeTab === example.id ? 'bold' : 'normal',
              transition: 'all 0.3s',
            }}
          >
            {example.name}
          </button>
        ))}
      </div>

      {/* API Info */}
      {currentExample && (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #dee2e6'
        }}>
          <h2 style={{ marginTop: 0, color: '#007bff' }}>{currentExample.name}</h2>
          <p style={{ color: '#666', marginBottom: '15px' }}>{currentExample.description}</p>
          <div style={{ 
            backgroundColor: '#282c34', 
            color: '#61dafb', 
            padding: '15px', 
            borderRadius: '5px',
            fontFamily: 'monospace',
            fontSize: '14px',
            overflowX: 'auto'
          }}>
            <strong>Endpoint:</strong> {currentExample.endpoint}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '18px', color: '#666' }}>
          Loading...
        </div>
      )}

      {/* Data Display */}
      {!loading && data && (
        <div>
          {/* Success/Error Indicator */}
          <div style={{ 
            padding: '10px 20px', 
            borderRadius: '5px',
            marginBottom: '20px',
            backgroundColor: data.success ? '#d4edda' : '#f8d7da',
            color: data.success ? '#155724' : '#721c24',
            border: `1px solid ${data.success ? '#c3e6cb' : '#f5c6cb'}`
          }}>
            <strong>{data.success ? '✅ Success' : '❌ Error'}</strong>
            {!data.success && `: ${data.error}`}
          </div>

          {/* Render based on data type */}
          {data.success && activeTab === 'products' && (
            <ProductsList products={data.data.products} pagination={data.data.pagination} />
          )}

          {data.success && activeTab === 'product-single' && (
            <SingleProduct product={data.data.product} images={data.data.images} categories={data.data.categories} />
          )}

          {data.success && (activeTab === 'search' || activeTab === 'category-products' || activeTab === 'featured' || activeTab === 'latest') && (
            <ProductsList products={data.data.products} pagination={data.data.pagination} />
          )}

          {data.success && activeTab === 'special' && (
            <SpecialProducts products={data.data.products} />
          )}

          {data.success && activeTab === 'stats' && (
            <StatsDisplay stats={data.data} />
          )}

          {data.success && activeTab === 'categories' && (
            <CategoriesList categories={data.data.categories} />
          )}

          {data.success && activeTab === 'category-single' && (
            <SingleCategory category={data.data} />
          )}

          {data.success && activeTab === 'navigation' && (
            <NavigationTree categories={data.data.categories} />
          )}

          {/* Raw JSON */}
          <details style={{ marginTop: '30px' }}>
            <summary style={{ 
              cursor: 'pointer', 
              padding: '10px', 
              backgroundColor: '#e9ecef',
              borderRadius: '5px',
              fontWeight: 'bold'
            }}>
              📋 View Raw JSON Response
            </summary>
            <pre style={{ 
              backgroundColor: '#282c34', 
              color: '#61dafb', 
              padding: '20px', 
              borderRadius: '5px',
              overflow: 'auto',
              maxHeight: '500px',
              marginTop: '10px'
            }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// Helper function to get full image URL
function getImageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) {
    return 'https://www.oweg.in/image/no_image.png';
  }
  // Remove leading slash if present
  const cleanPath = imagePath.replace(/^\/+/, '');
  return `https://www.oweg.in/image/${cleanPath}`;
}

// Component: Products List
function ProductsList({ products, pagination }: { products: Product[]; pagination?: { total: number; offset: number; limit: number } }) {
  if (!products || products.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>No products found.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Products ({pagination?.total || products.length})</h3>
      {pagination && (
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
        </p>
      )}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: '20px' 
      }}>
        {products.map((product: Product) => (
          <div key={product.product_id} style={{ 
            border: '1px solid #ddd', 
            borderRadius: '8px', 
            padding: '15px',
            backgroundColor: 'white'
          }}>
            {product.image ? (
              <img 
                src={getImageUrl(product.image)}
                alt={product.name}
                style={{ 
                  width: '100%', 
                  height: '200px', 
                  objectFit: 'cover',
                  borderRadius: '5px',
                  marginBottom: '10px'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://www.oweg.in/image/no_image.png';
                }}
              />
            ) : (
              <div style={{ 
                width: '100%', 
                height: '200px', 
                backgroundColor: '#f5f5f5',
                borderRadius: '5px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: '12px'
              }}>
                No image
              </div>
            )}
            <h4 style={{ margin: '10px 0', fontSize: '14px', height: '40px', overflow: 'hidden' }}>
              {product.name || 'Unnamed Product'}
            </h4>
            <p style={{ color: '#007bff', fontWeight: 'bold', fontSize: '18px', margin: '5px 0' }}>
              ₹{product.price}
            </p>
            <p style={{ fontSize: '12px', color: '#666' }}>
              Stock: {product.quantity} | Views: {product.viewed || 0}
            </p>
            <p style={{ fontSize: '11px', color: '#999' }}>
              ID: {product.product_id}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component: Single Product
function SingleProduct({ product, images, categories }: { product: Product; images?: Array<{ image: string }>; categories?: Array<{ category_id: number; category_name: string }> }) {
  if (!product) {
    return (
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <p>No product data available</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
      <h2>{product.name || 'Unnamed Product'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div>
          <h3>Product Details</h3>
          <p><strong>Price:</strong> ₹{product.price || 'N/A'}</p>
          <p><strong>Stock:</strong> {product.quantity || 0}</p>
          <p><strong>Model:</strong> {product.model || 'N/A'}</p>
          <p><strong>SKU:</strong> {product.sku || 'N/A'}</p>
          <p><strong>Status:</strong> {product.status === 1 ? 'Active' : 'Inactive'}</p>
          <p><strong>Views:</strong> {product.viewed || 0}</p>
        </div>
        <div>
          <h3>Categories</h3>
              {categories?.map((cat) => (
            <span key={cat.category_id} style={{ 
              display: 'inline-block',
              backgroundColor: '#007bff',
              color: 'white',
              padding: '5px 10px',
              borderRadius: '5px',
              marginRight: '5px',
              marginBottom: '5px',
              fontSize: '12px'
            }}>
              {cat.category_name}
            </span>
          ))}
          <h3 style={{ marginTop: '20px' }}>Images ({images?.length || 0})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {images?.slice(0, 5).map((img, idx: number) => (
              <img
                key={idx}
                src={getImageUrl(img.image)}
                alt={`Product image ${idx + 1}`}
                style={{ 
                  width: '80px',
                  height: '80px',
                  objectFit: 'cover',
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://www.oweg.in/image/no_image.png';
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Component: Special Products
function SpecialProducts({ products }: { products: Array<Product & { special_price: string }> }) {
  if (!products || products.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>No special/sale products available at the moment.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Products on Sale</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
        {products.map((product) => (
          <div key={product.product_id} style={{ 
            border: '1px solid #ddd', 
            borderRadius: '8px', 
            padding: '15px',
            backgroundColor: 'white',
            position: 'relative'
          }}>
            <div style={{ 
              position: 'absolute',
              top: '10px',
              right: '10px',
              backgroundColor: '#dc3545',
              color: 'white',
              padding: '5px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              fontWeight: 'bold',
              zIndex: 1
            }}>
              SALE
            </div>
            {product.image && (
              <img 
                src={getImageUrl(product.image)}
                alt={product.name}
                style={{ 
                  width: '100%', 
                  height: '180px', 
                  objectFit: 'cover',
                  borderRadius: '5px',
                  marginBottom: '10px'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://www.oweg.in/image/no_image.png';
                }}
              />
            )}
            <h4 style={{ margin: '10px 0', fontSize: '14px' }}>{product.name}</h4>
            <p style={{ fontSize: '12px', color: '#999', textDecoration: 'line-through' }}>
              ₹{product.price}
            </p>
            <p style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '18px', margin: '5px 0' }}>
              ₹{product.special_price}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component: Stats
function StatsDisplay({ stats }: { stats: { statistics: Stats; topViewed?: Array<{ product_id: number; name: string; price: string; viewed: number }> } }) {
  if (!stats || !stats.statistics) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>Loading statistics...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <StatCard title="Total Products" value={stats.statistics.totalProducts} color="#007bff" />
        <StatCard title="Active Products" value={stats.statistics.activeProducts} color="#28a745" />
        <StatCard title="In Stock" value={stats.statistics.stock.inStock} color="#17a2b8" />
        <StatCard title="Out of Stock" value={stats.statistics.stock.outOfStock} color="#dc3545" />
      </div>
      
      <h3>Pricing Statistics</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <StatCard title="Min Price" value={`₹${stats.statistics.pricing.min}`} color="#6c757d" />
        <StatCard title="Average Price" value={`₹${stats.statistics.pricing.average}`} color="#ffc107" />
        <StatCard title="Max Price" value={`₹${stats.statistics.pricing.max}`} color="#fd7e14" />
      </div>

      <h3>Top Viewed Products</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Product</th>
              <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Price</th>
              <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Views</th>
            </tr>
          </thead>
          <tbody>
            {stats.topViewed?.slice(0, 5).map((product) => (
              <tr key={product.product_id}>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{product.name}</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>₹{product.price}</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{product.viewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: any; color: string }) {
  return (
    <div style={{ 
      backgroundColor: 'white',
      border: `2px solid ${color}`,
      borderRadius: '8px',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h4 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>{title}</h4>
      <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color }}>{value}</p>
    </div>
  );
}

// Component: Categories List
function CategoriesList({ categories }: { categories: Category[] }) {
  if (!categories || categories.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>No categories available.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
      {categories.map((cat: Category) => (
        <div key={cat.category_id} style={{ 
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '15px',
          backgroundColor: 'white'
        }}>
          <h4 style={{ margin: '0 0 5px 0' }}>{cat.name}</h4>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>ID: {cat.category_id}</p>
          <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
            Parent: {cat.parent_id === 0 ? 'Top Level' : cat.parent_id}
          </p>
        </div>
      ))}
    </div>
  );
}

// Component: Single Category
function SingleCategory({ category }: { category: { category: Category; product_count?: number; subcategories?: Array<{ category_id: number; name: string }> } }) {
  if (!category || !category.category) {
    return (
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <p>No category data available</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
      <h2>{category.category.name || 'Unnamed Category'}</h2>
      <p><strong>Category ID:</strong> {category.category.category_id}</p>
      <p><strong>Total Products:</strong> {category.product_count || 0}</p>
      
      {category.subcategories?.length > 0 && (
        <>
          <h3 style={{ marginTop: '20px' }}>Subcategories ({category.subcategories.length})</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
            {category.subcategories.map((sub) => (
              <div key={sub.category_id} style={{ 
                backgroundColor: '#f8f9fa',
                padding: '10px',
                borderRadius: '5px',
                border: '1px solid #dee2e6'
              }}>
                {sub.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Component: Navigation Tree
function NavigationTree({ categories }: { categories: Category[] }) {
  if (!categories || categories.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>No navigation data available.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Complete Navigation Structure</h3>
      {categories.map((cat: Category) => (
        <div key={cat.category_id} style={{ 
          marginBottom: '20px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            backgroundColor: '#007bff',
            color: 'white',
            padding: '15px',
            fontWeight: 'bold'
          }}>
            {cat.name} ({cat.subcategories?.length || 0} subcategories)
          </div>
          {cat.subcategories && cat.subcategories.length > 0 && (
            <div style={{ padding: '15px', backgroundColor: 'white' }}>
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px'
              }}>
                {cat.subcategories.map((sub: Category) => (
                  <div key={sub.category_id} style={{ 
                    padding: '10px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '5px',
                    fontSize: '14px'
                  }}>
                    📁 {sub.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

