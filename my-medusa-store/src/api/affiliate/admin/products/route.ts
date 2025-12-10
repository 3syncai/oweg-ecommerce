// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { verifyAffiliateToken } from "../../_lib/token"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import { Client } from "pg"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req: MedusaRequest): Promise<{ isValid: boolean; adminId?: string }> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { isValid: false }
    }

    const token = authHeader.substring(7)
    const claims = verifyAffiliateToken(token)
    
    if (!claims || claims.role !== "admin") {
      return { isValid: false }
    }

    return { isValid: true, adminId: claims.sub }
  } catch (error) {
    return { isValid: false }
  }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  
  // Authenticate affiliate admin
  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
    })
  }

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    let inventoryModuleService: any = null
    try {
      inventoryModuleService = req.scope.resolve(Modules.INVENTORY)
    } catch (error) {
      console.log("Inventory module not available")
    }
    
    // Get all products - Medusa v2 listProducts returns basic product data
    // We need to fetch variants separately
    let products: any[] = []
    try {
      products = await productModuleService.listProducts({}) || []
    } catch (error: any) {
      console.error("Error fetching products:", error)
      return res.status(500).json({
        message: "Failed to fetch products",
        error: error?.message || String(error),
        products: [],
        filters: { categories: [], collections: [], types: [] },
        stats: { total: 0, in_stock: 0, out_of_stock: 0 },
      })
    }
    
    if (!products || products.length === 0) {
      return res.json({
        products: [],
        filters: { categories: [], collections: [], types: [] },
        stats: { total: 0, in_stock: 0, out_of_stock: 0 },
      })
    }
    
    console.log(`Fetched ${products.length} products`)

    // Use query API to get products with all relations
    const query = req.scope.resolve("query")
    let productsWithVariants: any[] = []
    
    try {
      // Get all products at once - use listProducts which is faster
      const productIds = products.map((p: any) => p.id)
      console.log(`Processing ${productIds.length} products`)
      
      // Fetch all variants in one query
      let allVariants: any[] = []
      try {
        const { data: variantsData } = await query.graph({
          entity: "product_variant",
          fields: ["id", "product_id", "title", "sku", "inventory_quantity", "prices.*", "calculated_price", "original_price"],
        })
        allVariants = variantsData || []
        console.log(`Fetched ${allVariants.length} variants`)
      } catch (e: any) {
        console.log("Could not fetch all variants at once:", e?.message)
      }
      
      // Group variants by product_id
      const variantsByProduct = new Map<string, any[]>()
      allVariants.forEach((variant: any) => {
        if (variant.product_id) {
          const existing = variantsByProduct.get(variant.product_id) || []
          existing.push(variant)
          variantsByProduct.set(variant.product_id, existing)
        }
      })
      
      // Fetch all categories in one query
      let allCategories: any[] = []
      try {
        const { data: categoriesData } = await query.graph({
          entity: "product_category",
          fields: ["id", "name", "handle", "metadata"],
        })
        allCategories = categoriesData || []
        console.log(`Fetched ${allCategories.length} categories`)
        if (allCategories.length > 0) {
          console.log("Sample categories:", allCategories.slice(0, 3).map((c: any) => ({ id: c.id, name: c.name })))
        }
      } catch (e: any) {
        console.log("Could not fetch all categories:", e?.message)
        // Try alternative method
        try {
          const productModuleService = req.scope.resolve(Modules.PRODUCT)
          // Try to list categories if query.graph doesn't work
          if (typeof (productModuleService as any).listProductCategories === 'function') {
            allCategories = await (productModuleService as any).listProductCategories({}) || []
            console.log(`Fetched ${allCategories.length} categories via listProductCategories`)
          }
        } catch (e2: any) {
          console.log("Alternative category fetch also failed:", e2?.message)
        }
      }
      
      // Fetch all collections in one query
      let allCollections: any[] = []
      try {
        const { data: collectionsData } = await query.graph({
          entity: "product_collection",
          fields: ["id", "title", "handle", "metadata"],
        })
        allCollections = collectionsData || []
        console.log(`Fetched ${allCollections.length} collections`)
      } catch (e: any) {
        console.log("Could not fetch all collections:", e?.message)
      }
      
      // Fetch all product-category links using raw SQL (more reliable)
      const productCategoryLinksMap = new Map<string, string[]>()
      try {
        const databaseUrl = process.env.DATABASE_URL
        if (databaseUrl) {
          const client = new Client({ connectionString: databaseUrl })
          await client.connect()
          
          // First, try to find the actual table name by querying information_schema
          let actualTableName: string | null = null
          try {
            const tableQuery = `
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND (table_name LIKE '%product%category%' OR table_name LIKE '%category%product%')
              ORDER BY table_name
            `
            const tableResult = await client.query(tableQuery)
            if (tableResult.rows && tableResult.rows.length > 0) {
              console.log("Found potential product-category link tables:", tableResult.rows.map((r: any) => r.table_name))
              // Try the first one
              actualTableName = tableResult.rows[0].table_name
            }
          } catch (e: any) {
            console.log("Could not query information_schema:", e?.message)
          }
          
          // Try different possible table names and column combinations
          const linkTableNames = actualTableName 
            ? [actualTableName]
            : [
                "product_category_product",
                "product_product_category",
                "product_category",
                "product_product_category_link",
                "product_category_link",
              ]
          
          for (const tableName of linkTableNames) {
            try {
              // Try different column name combinations
              const columnCombinations = [
                { product: "product_id", category: "category_id" },
                { product: "product_id", category: "product_category_id" },
                { product: "id", category: "category_id" },
                { product: "product_id", category: "id" },
              ]
              
              for (const cols of columnCombinations) {
                try {
                  const result = await client.query(
                    `SELECT ${cols.product} as product_id, ${cols.category} as category_id FROM ${tableName} LIMIT 1`
                  )
                  if (result.rows && result.rows.length > 0) {
                    // Found the right table and columns, now get all data
                    const allResult = await client.query(
                      `SELECT ${cols.product} as product_id, ${cols.category} as category_id FROM ${tableName}`
                    )
                    if (allResult.rows && allResult.rows.length > 0) {
                      allResult.rows.forEach((row: any) => {
                        if (row.product_id && row.category_id) {
                          const existing = productCategoryLinksMap.get(row.product_id) || []
                          existing.push(row.category_id)
                          productCategoryLinksMap.set(row.product_id, existing)
                        }
                      })
                      console.log(`Found ${allResult.rows.length} product-category links in table ${tableName} with columns ${cols.product}/${cols.category}`)
                      await client.end()
                      break
                    }
                  }
                } catch (colError: any) {
                  // Wrong column names, try next combination
                  continue
                }
              }
              
              if (productCategoryLinksMap.size > 0) {
                break // Found links, exit
              }
            } catch (e: any) {
              // Table doesn't exist or query failed, try next
              console.log(`Table ${tableName} query failed:`, e?.message)
              continue
            }
          }
          
          if (productCategoryLinksMap.size === 0) {
            console.log("No product-category links found via SQL. Trying retrieveProduct method for each product.")
          }
          
          await client.end()
        }
      } catch (sqlError: any) {
        console.log("Could not fetch product-category links via SQL:", sqlError?.message)
      }
      
      // Log first product to see its structure
      if (products.length > 0) {
        console.log("Sample product from listProducts:", {
          id: products[0].id,
          hasCategoryIds: !!products[0].category_ids,
          categoryIds: products[0].category_ids,
          hasCollectionId: !!products[0].collection_id,
          collectionId: products[0].collection_id,
          metadata: products[0].metadata,
        })
        
        // Try to retrieve first product to see its structure
        try {
          const sampleProduct = await productModuleService.retrieveProduct(products[0].id)
          console.log("Sample product from retrieveProduct:", {
            id: sampleProduct.id,
            hasCategories: !!sampleProduct.categories,
            categories: sampleProduct.categories,
            hasCategoryIds: !!sampleProduct.category_ids,
            categoryIds: sampleProduct.category_ids,
            hasCollection: !!sampleProduct.collection,
            collection: sampleProduct.collection,
            hasCollectionId: !!sampleProduct.collection_id,
            collectionId: sampleProduct.collection_id,
          })
        } catch (e: any) {
          console.log("Could not retrieve sample product:", e?.message)
        }
      }
      
      // Process products in batches - ALWAYS use retrieveProduct to get categories (most reliable)
      const batchSize = 30 // Increased batch size
      
      // Initialize persistent DB client for SQL fallbacks
      let persistentClient: any = null;
      let linkTableCache: string | null = null;
      try {
        if (process.env.DATABASE_URL) {
           persistentClient = new Client({ connectionString: process.env.DATABASE_URL });
           await persistentClient.connect();
        }
      } catch (e) {
         console.log("Failed to connect persistent DB client:", e);
      }

      try {
      for (let i = 0; i < products.length; i += batchSize) {
        const productBatch = products.slice(i, i + batchSize)
        const batchPromises = productBatch.map(async (product: any) => {
          try {
            // Get variants for this product
            const productVariants = variantsByProduct.get(product.id) || []
            
            // Get categories and collection - ALWAYS use retrieveProduct
            let productCategories: any[] = []
            let productCollection: any = null
            
            try {
              // Retrieve full product - try with relations first
              let fullProduct: any
              try {
                fullProduct = await productModuleService.retrieveProduct(product.id, {
                  relations: ["categories", "collection"],
                })
              } catch (e) {
                // Fallback without relations
                fullProduct = await productModuleService.retrieveProduct(product.id)
              }
              
              // Get categories - try multiple ways
              let categoryIds: string[] = []
              
              // Method 1: Check fullProduct.categories array (if relations worked)
              if (fullProduct.categories && Array.isArray(fullProduct.categories) && fullProduct.categories.length > 0) {
                // Categories are already objects, use them directly
                productCategories = fullProduct.categories.map((cat: any) => ({
                  id: cat.id || cat.category_id || "",
                  name: cat.name || cat.title || "Unknown",
                  handle: cat.handle || "",
                  commission: (cat.metadata?.affiliate_commission) || 0,
                })).filter((cat: any) => cat.id) // Filter out invalid entries
              } else if (fullProduct.category_ids && Array.isArray(fullProduct.category_ids)) {
                // Method 2: Use category_ids to look up in allCategories
                categoryIds = fullProduct.category_ids
                productCategories = allCategories
                  .filter((cat: any) => categoryIds.includes(cat.id))
                  .map((cat: any) => ({
                    id: cat.id,
                    name: cat.name || "Unknown",
                    handle: cat.handle || "",
                    commission: (cat.metadata?.affiliate_commission) || 0,
                  }))
              }
              
                  // Method 3: If still no categories, try direct SQL query for this product
                  if (productCategories.length === 0) {
                     // We use the shared client created outside the loop
                     try {
                        if (persistentClient) {
                           // Try to find the link table if not known
                           let linkTable = linkTableCache;
                           if (!linkTable) {
                              const linkTableQuery = `
                                 SELECT table_name 
                                 FROM information_schema.tables 
                                 WHERE table_schema = 'public' 
                                 AND (table_name LIKE '%product%category%' OR table_name LIKE '%category%product%')
                                 LIMIT 1
                              `
                              const tableResult = await persistentClient.query(linkTableQuery)
                              if (tableResult.rows && tableResult.rows.length > 0) {
                                  linkTable = tableResult.rows[0].table_name
                                  linkTableCache = linkTable; // Cache it
                              }
                           }

                           if (linkTable) {
                              // We need to know columns too - cache them?
                              // For simplicity in this fix, we'll just do the improved query if table is known
                              // Or just stick to the original logic but reuse client
                              // The original logic queried columns every time. Let's keep it robust but reuse client.
                              
                              const colQuery = `
                                 SELECT column_name 
                                 FROM information_schema.columns 
                                 WHERE table_name = $1 AND table_schema = 'public'
                              `
                              const colResult = await persistentClient.query(colQuery, [linkTable])
                              const columns = colResult.rows.map((r: any) => r.column_name)

                              const productCol = columns.find((c: string) => c.includes('product') && c.includes('id'))
                              const categoryCol = columns.find((c: string) => c.includes('category') && c.includes('id'))

                              if (productCol && categoryCol) {
                                 const linkQuery = `SELECT ${categoryCol} as category_id FROM ${linkTable} WHERE ${productCol} = $1`
                                 const linkResult = await persistentClient.query(linkQuery, [product.id])
                                 if (linkResult.rows && linkResult.rows.length > 0) {
                                    categoryIds = linkResult.rows.map((r: any) => r.category_id).filter(Boolean)
                                    productCategories = allCategories
                                       .filter((cat: any) => categoryIds.includes(cat.id))
                                       .map((cat: any) => ({
                                          id: cat.id,
                                          name: cat.name || "Unknown",
                                          handle: cat.handle || "",
                                          commission: (cat.metadata?.affiliate_commission) || 0,
                                       }))
                                 }
                              }
                           }
                        }
                     } catch (sqlErr: any) {
                        // SQL query failed, continue
                     }
                  }
              
              // Fallback: Check SQL link table map
              if (productCategories.length === 0 && productCategoryLinksMap.has(product.id)) {
                categoryIds = productCategoryLinksMap.get(product.id) || []
                productCategories = allCategories
                  .filter((cat: any) => categoryIds.includes(cat.id))
                  .map((cat: any) => ({
                    id: cat.id,
                    name: cat.name || "Unknown",
                    handle: cat.handle || "",
                    commission: (cat.metadata?.affiliate_commission) || 0,
                  }))
              }
              
              // Get collection
              if (fullProduct.collection) {
                productCollection = {
                  id: fullProduct.collection.id || fullProduct.collection.collection_id || "",
                  title: fullProduct.collection.title || fullProduct.collection.name || "Unknown",
                  handle: fullProduct.collection.handle || "",
                  commission: (fullProduct.collection.metadata?.affiliate_commission) || 0,
                }
              } else if (fullProduct.collection_id) {
                const foundCollection = allCollections.find((col: any) => col.id === fullProduct.collection_id)
                if (foundCollection) {
                  productCollection = {
                    id: foundCollection.id,
                    title: foundCollection.title || "Unknown",
                    handle: foundCollection.handle || "",
                    commission: (foundCollection.metadata?.affiliate_commission) || 0,
                  }
                }
              }
            } catch (retrieveError: any) {
              // If retrieveProduct fails, try fallbacks
              console.log(`Could not retrieve product ${product.id}:`, retrieveError?.message)
              
              // Fallback: Check SQL link table
              if (productCategoryLinksMap.has(product.id)) {
                const categoryIds = productCategoryLinksMap.get(product.id) || []
                productCategories = allCategories
                  .filter((cat: any) => categoryIds.includes(cat.id))
                  .map((cat: any) => ({
                    id: cat.id,
                    name: cat.name || "Unknown",
                    handle: cat.handle || "",
                    commission: (cat.metadata?.affiliate_commission) || 0,
                  }))
              }
              
              // Fallback: Check product.collection_id
              if (product.collection_id) {
                const foundCollection = allCollections.find((col: any) => col.id === product.collection_id)
                if (foundCollection) {
                  productCollection = {
                    id: foundCollection.id,
                    title: foundCollection.title || "Unknown",
                    handle: foundCollection.handle || "",
                    commission: (foundCollection.metadata?.affiliate_commission) || 0,
                  }
                }
              }
            }
            
            // Get collection - check product.collection_id first (from listProducts)
            let collectionId: string | null = null
            if (product.collection_id) {
              collectionId = product.collection_id
              console.log(`Product ${product.id} has collection_id:`, collectionId)
            }
            
            // Try retrieveProduct if collection_id not found
            if (!collectionId) {
              try {
                const fullProduct = await productModuleService.retrieveProduct(product.id)
                if (fullProduct.collection) {
                  collectionId = fullProduct.collection.id || fullProduct.collection.collection_id || null
                  console.log(`Product ${product.id} collection from retrieveProduct:`, collectionId)
                } else if (fullProduct.collection_id) {
                  collectionId = fullProduct.collection_id
                  console.log(`Product ${product.id} collection_id from retrieveProduct:`, collectionId)
                }
              } catch (e: any) {
                console.log(`Could not retrieve product ${product.id} for collection:`, e?.message)
              }
            }
            
            // Check metadata
            if (!collectionId && product.metadata?.collection_id) {
              collectionId = product.metadata.collection_id
              console.log(`Product ${product.id} collection_id from metadata:`, collectionId)
            }
            
            // Map collection ID to collection object
            if (collectionId) {
              const foundCollection = allCollections.find((col: any) => col.id === collectionId)
              if (foundCollection) {
                productCollection = {
                  id: foundCollection.id,
                  title: foundCollection.title || "Unknown",
                  handle: foundCollection.handle || "",
                  commission: (foundCollection.metadata?.affiliate_commission) || 0,
                }
                console.log(`Product ${product.id} mapped to collection:`, productCollection.title)
              } else {
                console.log(`Product ${product.id} collection_id ${collectionId} not found in allCollections`)
              }
            } else {
              console.log(`Product ${product.id} has no collection`)
            }
            
            // Build product object with all data
            const fullProduct = {
              ...product,
              variants: productVariants,
              categories: productCategories,
              collection: productCollection,
            }
            
            return fullProduct
          } catch (error: any) {
            console.log(`Error processing product ${product.id}:`, error?.message)
            return {
              ...product,
              variants: variantsByProduct.get(product.id) || [],
              categories: [],
              collection: null,
            }
          }
        })
        
        const batchResults = await Promise.all(batchPromises)
        productsWithVariants.push(...batchResults)
      }
      } finally {
        if (persistentClient) {
           await persistentClient.end().catch(() => {});
        }
      }
      
      console.log(`Fetched ${productsWithVariants.length} products with relations`)
    } catch (queryError: any) {
      console.log("Query API error, using basic product data:", queryError?.message)
      // Fallback: use basic product data without relations (much faster)
      productsWithVariants = products.map((product: any) => ({
        ...product,
        variants: [],
        categories: [],
        collection: null,
      }))
    }
    
    console.log(`Total products processed: ${productsWithVariants.length}`)
    
    // Log sample product to debug structure
    if (productsWithVariants.length > 0) {
      const sample = productsWithVariants[0]
      console.log("Sample product structure:", {
        id: sample.id,
        title: sample.title,
        hasVariants: !!sample.variants,
        variantCount: Array.isArray(sample.variants) ? sample.variants.length : 0,
        hasCategories: !!sample.categories,
        categoryCount: Array.isArray(sample.categories) ? sample.categories.length : 0,
        hasCollection: !!sample.collection,
        collectionTitle: sample.collection?.title || sample.collection?.name,
      })
    }

    // Get inventory items for all product variants
    const variantIds: string[] = []
    productsWithVariants.forEach((p: any) => {
      if (p.variants && Array.isArray(p.variants)) {
        p.variants.forEach((v: any) => {
          if (v && v.id) variantIds.push(v.id)
        })
      }
    })
    
    console.log(`Found ${variantIds.length} variants across ${productsWithVariants.length} products`)

    let inventoryMap = new Map()
    if (variantIds.length > 0) {
      try {
        const query = req.scope.resolve("query")
        
        // Get inventory items linked to variants through link table or SKU matching
        try {
          // Get all inventory items
          const { data: allInventoryItems } = await query.graph({
            entity: "inventory_item",
            fields: ["id", "sku"],
          })
          
          // Get variant-inventory links (try different possible link table names)
          const linkTableNames = [
            "product_variant_inventory_item",
            "inventory_item_product_variant",
            "product_variant_inventory_item_link",
          ]
          
          let variantInventoryLinks: any[] = []
          for (const tableName of linkTableNames) {
            try {
              const { data: links } = await query.graph({
                entity: tableName,
                fields: ["variant_id", "inventory_item_id"],
                filters: {
                  variant_id: variantIds,
                },
              })
              if (links && links.length > 0) {
                variantInventoryLinks = links
                console.log(`Found ${variantInventoryLinks.length} variant-inventory links using ${tableName}`)
                break
              }
            } catch (e) {
              continue
            }
          }
          
          // Fallback: try to get inventory items by SKU matching variant SKU
          if (variantInventoryLinks.length === 0) {
            console.log("No link table found, trying SKU matching")
            const variantSkuMap = new Map()
            productsWithVariants.forEach((p: any) => {
              (p.variants || []).forEach((v: any) => {
                if (v.sku) variantSkuMap.set(v.sku, v.id)
              })
            })
            
            if (allInventoryItems && allInventoryItems.length > 0) {
              allInventoryItems.forEach((item: any) => {
                if (item.sku && variantSkuMap.has(item.sku)) {
                  variantInventoryLinks.push({
                    variant_id: variantSkuMap.get(item.sku),
                    inventory_item_id: item.id,
                  })
                }
              })
              console.log(`Found ${variantInventoryLinks.length} variant-inventory links via SKU matching`)
            }
          }
          
          if (variantInventoryLinks.length > 0) {
            const inventoryItemIds = [...new Set(variantInventoryLinks.map((link: any) => link.inventory_item_id).filter(Boolean))]
            
            // Get inventory levels
            const { data: inventoryLevels } = await query.graph({
              entity: "inventory_level",
              fields: [
                "id",
                "inventory_item_id",
                "location_id",
                "stocked_quantity",
                "reserved_quantity",
              ],
              filters: {
                inventory_item_id: inventoryItemIds,
              },
            })
            
            console.log(`Found ${inventoryLevels?.length || 0} inventory levels`)

            // Create a map of inventory_item_id to total available quantity
            const itemQuantityMap = new Map()
            if (inventoryLevels && Array.isArray(inventoryLevels)) {
              inventoryLevels.forEach((level: any) => {
                const itemId = level.inventory_item_id
                const stocked = Number(level.stocked_quantity) || 0
                const reserved = Number(level.reserved_quantity) || 0
                const available = Math.max(0, stocked - reserved)
                
                const existing = itemQuantityMap.get(itemId) || 0
                itemQuantityMap.set(itemId, existing + available)
              })
            }

            // Map to variants
            variantInventoryLinks.forEach((link: any) => {
              const variantId = link.variant_id
              const itemId = link.inventory_item_id
              if (variantId && itemId) {
                const availableQuantity = itemQuantityMap.get(itemId) || 0
                const existing = inventoryMap.get(variantId) || { quantity: 0 }
                inventoryMap.set(variantId, {
                  quantity: existing.quantity + availableQuantity,
                  location_id: null,
                })
              }
            })
          }
        } catch (queryError: any) {
          console.log("Query API inventory error:", queryError?.message)
        }
      } catch (error: any) {
        console.log("Inventory error:", error?.message || error)
      }
    }
    
    // Fallback: use variant inventory_quantity if available and no inventory data found
    productsWithVariants.forEach((product: any) => {
      (product.variants || []).forEach((variant: any) => {
        if (!inventoryMap.has(variant.id)) {
          // Try to get from variant metadata or direct property
          const variantInventory = variant.inventory_quantity || 
                                  variant.metadata?.inventory_quantity ||
                                  0
          inventoryMap.set(variant.id, {
            quantity: Number(variantInventory) || 0,
            location_id: null,
          })
        }
      })
    })
    
    console.log(`Inventory map created with ${inventoryMap.size} variants`)
    if (inventoryMap.size > 0) {
      const sampleEntries = Array.from(inventoryMap.entries()).slice(0, 5)
      console.log(`Sample inventory data:`, sampleEntries)
      const totalQty = Array.from(inventoryMap.values()).reduce((sum, inv) => sum + (inv.quantity || 0), 0)
      console.log(`Total inventory quantity across all variants:`, totalQty)
    } else {
      console.log("WARNING: No inventory data found for any variants!")
    }

    // Fetch all commissions from database
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    let allCommissions: any[] = []
    try {
      allCommissions = await affiliateService.listAffiliateCommissions({}) || []
      console.log(`Loaded ${allCommissions.length} commission settings from database`)
    } catch (error: any) {
      console.log("Error fetching commissions (table may not exist yet):", error?.message)
      allCommissions = []
    }

    // Create commission maps for quick lookup
    const productCommissionMap = new Map<string, number>()
    const categoryCommissionMap = new Map<string, number>()
    const collectionCommissionMap = new Map<string, number>()
    const typeCommissionMap = new Map<string, number>()

    allCommissions.forEach((comm: any) => {
      if (comm.product_id) {
        productCommissionMap.set(comm.product_id, comm.commission_rate)
      } else if (comm.category_id) {
        categoryCommissionMap.set(comm.category_id, comm.commission_rate)
      } else if (comm.collection_id) {
        collectionCommissionMap.set(comm.collection_id, comm.commission_rate)
      } else if (comm.type_id) {
        typeCommissionMap.set(comm.type_id, comm.commission_rate)
      }
    })

    // Format products with commission and inventory data
    const formattedProducts = productsWithVariants.map((product: any) => {
      try {
        // Get variants - handle cases where variants might not be loaded
        const productVariants = Array.isArray(product.variants) ? product.variants : []
        const variants = productVariants.map((variant: any) => {
          if (!variant || !variant.id) return null
          const inventory = inventoryMap.get(variant.id) || { quantity: variant.inventory_quantity || 0, location_id: null }
           // Get price from variant prices array or calculated price
           // Keep price as-is, no division
           let price = 0
           if (variant.calculated_price) {
             price = Number(variant.calculated_price)
           } else if (variant.original_price) {
             price = Number(variant.original_price)
           } else if (variant.prices && Array.isArray(variant.prices) && variant.prices.length > 0) {
             price = Number(variant.prices[0].amount || 0)
           }
          
          return {
            id: variant.id,
            title: variant.title || product.title || "Untitled",
            sku: variant.sku || "N/A",
            inventory_quantity: inventory.quantity,
            price: price,
          }
        }).filter((v: any) => v !== null)

         const totalInventory = variants.reduce((sum: number, v: any) => sum + (v?.inventory_quantity || 0), 0)
         const inStock = totalInventory > 0

         // Safely access categories, collection, tags, type (must be declared before use)
         const categories = Array.isArray(product.categories) 
           ? product.categories.map((cat: any) => ({
               id: cat?.id || cat?.category_id || "",
               name: cat?.name || cat?.title || "Unknown",
               handle: cat?.handle || "",
               commission: (cat?.metadata?.affiliate_commission) || 0,
             }))
           : []

         const collection = product.collection && typeof product.collection === 'object'
           ? {
               id: product.collection.id || product.collection.collection_id || "",
               title: product.collection.title || product.collection.name || "Unknown",
               handle: product.collection.handle || "",
               commission: (product.collection.metadata?.affiliate_commission) || 0,
             }
           : null

         const tags = Array.isArray(product.tags)
           ? product.tags.map((tag: any) => ({
               id: tag?.id || tag?.tag_id || "",
               value: tag?.value || "",
             }))
           : []

         const type = product.type && typeof product.type === 'object'
           ? {
               id: product.type.id || product.type.type_id || "",
               value: product.type.value || "",
             }
           : null

         // Get commission with priority: product > category > collection > type > metadata
         let commission = 0
         
         // Check product-specific commission first
         if (productCommissionMap.has(product.id)) {
           commission = productCommissionMap.get(product.id)!
         } else if (categories.length > 0) {
           // Check category commissions (first match)
           for (const cat of categories) {
             if (categoryCommissionMap.has(cat.id)) {
               commission = categoryCommissionMap.get(cat.id)!
               break
             }
           }
         }
         
         // Check collection commission
         if (commission === 0 && collection && collectionCommissionMap.has(collection.id)) {
           commission = collectionCommissionMap.get(collection.id)!
         }
         
         // Check type commission
         if (commission === 0 && type && typeCommissionMap.has(type.id)) {
           commission = typeCommissionMap.get(type.id)!
         }
         
         // Fallback to metadata
         if (commission === 0) {
           const metadata = product.metadata || {}
           commission = metadata.affiliate_commission || 
                       metadata.commission || 
                       (product.collection?.metadata?.affiliate_commission) ||
                       (product.categories?.[0]?.metadata?.affiliate_commission) ||
                       0
         }

        return {
          id: product.id || "",
          title: product.title || "Untitled Product",
          handle: product.handle || "",
          status: product.status || "draft",
          description: product.description || "",
          thumbnail: product.thumbnail || null,
          images: Array.isArray(product.images) ? product.images : [],
          categories,
          collection,
          tags,
          type,
          variants,
          total_inventory: totalInventory,
          in_stock: inStock,
          commission: typeof commission === 'number' ? commission : parseFloat(String(commission)) || 0,
          created_at: product.created_at,
          updated_at: product.updated_at,
        }
      } catch (error: any) {
        console.error(`Error formatting product ${product.id}:`, error)
        // Return a minimal product object to prevent breaking the entire list
        return {
          id: product.id || "",
          title: product.title || "Error loading product",
          handle: product.handle || "",
          status: product.status || "draft",
          description: "",
          thumbnail: null,
          images: [],
          categories: [],
          collection: null,
          tags: [],
          type: null,
          variants: [],
          total_inventory: 0,
          in_stock: false,
          commission: 0,
          created_at: product.created_at,
          updated_at: product.updated_at,
        }
      }
    })

    // Get unique categories, collections, and types for filters
    const categories = Array.from(
      new Map(
        formattedProducts.flatMap((p: any) => 
          (p.categories || []).map((cat: any) => [cat.id, {
            id: cat.id,
            name: cat.name,
            handle: cat.handle,
            commission: cat.commission || 0,
          }])
        )
      ).values()
    )

    const collections = Array.from(
      new Map(
        formattedProducts
          .filter((p: any) => p.collection)
          .map((p: any) => [p.collection.id, {
            id: p.collection.id,
            title: p.collection.title,
            handle: p.collection.handle,
            commission: p.collection.commission || 0,
          }])
      ).values()
    )

    const types = Array.from(
      new Map(
        formattedProducts
          .filter((p: any) => p.type)
          .map((p: any) => [p.type.id, {
            id: p.type.id,
            value: p.type.value,
          }])
      ).values()
    )

    return res.json({
      products: formattedProducts,
      filters: {
        categories,
        collections,
        types,
      },
      stats: {
        total: formattedProducts.length,
        in_stock: formattedProducts.filter((p: any) => p.in_stock).length,
        out_of_stock: formattedProducts.filter((p: any) => !p.in_stock).length,
      },
    })
  } catch (error: any) {
    console.error("Get products error:", error)
    return res.status(500).json({
      message: "Failed to fetch products",
      error: error?.message || String(error),
      products: [],
      filters: { categories: [], collections: [], types: [] },
      stats: { total: 0, in_stock: 0, out_of_stock: 0 },
    })
  }
}

