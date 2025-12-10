"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
const utils_1 = require("@medusajs/framework/utils");
const token_1 = require("../../_lib/token");
const affiliate_1 = require("../../../../modules/affiliate");
const pg_1 = require("pg");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { isValid: false };
        }
        const token = authHeader.substring(7);
        const claims = (0, token_1.verifyAffiliateToken)(token);
        if (!claims || claims.role !== "admin") {
            return { isValid: false };
        }
        return { isValid: true, adminId: claims.sub };
    }
    catch (error) {
        return { isValid: false };
    }
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
async function GET(req, res) {
    setCorsHeaders(res, req);
    // Authenticate affiliate admin
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
        });
    }
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        let inventoryModuleService = null;
        try {
            inventoryModuleService = req.scope.resolve(utils_1.Modules.INVENTORY);
        }
        catch (error) {
            console.log("Inventory module not available");
        }
        // Get all products - Medusa v2 listProducts returns basic product data
        // We need to fetch variants separately
        let products = [];
        try {
            products = await productModuleService.listProducts({}) || [];
        }
        catch (error) {
            console.error("Error fetching products:", error);
            return res.status(500).json({
                message: "Failed to fetch products",
                error: error?.message || String(error),
                products: [],
                filters: { categories: [], collections: [], types: [] },
                stats: { total: 0, in_stock: 0, out_of_stock: 0 },
            });
        }
        if (!products || products.length === 0) {
            return res.json({
                products: [],
                filters: { categories: [], collections: [], types: [] },
                stats: { total: 0, in_stock: 0, out_of_stock: 0 },
            });
        }
        console.log(`Fetched ${products.length} products`);
        // Use query API to get products with all relations
        const query = req.scope.resolve("query");
        let productsWithVariants = [];
        try {
            // Get all products at once - use listProducts which is faster
            const productIds = products.map((p) => p.id);
            console.log(`Processing ${productIds.length} products`);
            // Fetch all variants in one query
            let allVariants = [];
            try {
                const { data: variantsData } = await query.graph({
                    entity: "product_variant",
                    fields: ["id", "product_id", "title", "sku", "inventory_quantity", "prices.*", "calculated_price", "original_price"],
                });
                allVariants = variantsData || [];
                console.log(`Fetched ${allVariants.length} variants`);
            }
            catch (e) {
                console.log("Could not fetch all variants at once:", e?.message);
            }
            // Group variants by product_id
            const variantsByProduct = new Map();
            allVariants.forEach((variant) => {
                if (variant.product_id) {
                    const existing = variantsByProduct.get(variant.product_id) || [];
                    existing.push(variant);
                    variantsByProduct.set(variant.product_id, existing);
                }
            });
            // Fetch all categories in one query
            let allCategories = [];
            try {
                const { data: categoriesData } = await query.graph({
                    entity: "product_category",
                    fields: ["id", "name", "handle", "metadata"],
                });
                allCategories = categoriesData || [];
                console.log(`Fetched ${allCategories.length} categories`);
                if (allCategories.length > 0) {
                    console.log("Sample categories:", allCategories.slice(0, 3).map((c) => ({ id: c.id, name: c.name })));
                }
            }
            catch (e) {
                console.log("Could not fetch all categories:", e?.message);
                // Try alternative method
                try {
                    const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
                    // Try to list categories if query.graph doesn't work
                    if (typeof productModuleService.listProductCategories === 'function') {
                        allCategories = await productModuleService.listProductCategories({}) || [];
                        console.log(`Fetched ${allCategories.length} categories via listProductCategories`);
                    }
                }
                catch (e2) {
                    console.log("Alternative category fetch also failed:", e2?.message);
                }
            }
            // Fetch all collections in one query
            let allCollections = [];
            try {
                const { data: collectionsData } = await query.graph({
                    entity: "product_collection",
                    fields: ["id", "title", "handle", "metadata"],
                });
                allCollections = collectionsData || [];
                console.log(`Fetched ${allCollections.length} collections`);
            }
            catch (e) {
                console.log("Could not fetch all collections:", e?.message);
            }
            // Fetch all product-category links using raw SQL (more reliable)
            const productCategoryLinksMap = new Map();
            try {
                const databaseUrl = process.env.DATABASE_URL;
                if (databaseUrl) {
                    const client = new pg_1.Client({ connectionString: databaseUrl });
                    await client.connect();
                    // First, try to find the actual table name by querying information_schema
                    let actualTableName = null;
                    try {
                        const tableQuery = `
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND (table_name LIKE '%product%category%' OR table_name LIKE '%category%product%')
              ORDER BY table_name
            `;
                        const tableResult = await client.query(tableQuery);
                        if (tableResult.rows && tableResult.rows.length > 0) {
                            console.log("Found potential product-category link tables:", tableResult.rows.map((r) => r.table_name));
                            // Try the first one
                            actualTableName = tableResult.rows[0].table_name;
                        }
                    }
                    catch (e) {
                        console.log("Could not query information_schema:", e?.message);
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
                        ];
                    for (const tableName of linkTableNames) {
                        try {
                            // Try different column name combinations
                            const columnCombinations = [
                                { product: "product_id", category: "category_id" },
                                { product: "product_id", category: "product_category_id" },
                                { product: "id", category: "category_id" },
                                { product: "product_id", category: "id" },
                            ];
                            for (const cols of columnCombinations) {
                                try {
                                    const result = await client.query(`SELECT ${cols.product} as product_id, ${cols.category} as category_id FROM ${tableName} LIMIT 1`);
                                    if (result.rows && result.rows.length > 0) {
                                        // Found the right table and columns, now get all data
                                        const allResult = await client.query(`SELECT ${cols.product} as product_id, ${cols.category} as category_id FROM ${tableName}`);
                                        if (allResult.rows && allResult.rows.length > 0) {
                                            allResult.rows.forEach((row) => {
                                                if (row.product_id && row.category_id) {
                                                    const existing = productCategoryLinksMap.get(row.product_id) || [];
                                                    existing.push(row.category_id);
                                                    productCategoryLinksMap.set(row.product_id, existing);
                                                }
                                            });
                                            console.log(`Found ${allResult.rows.length} product-category links in table ${tableName} with columns ${cols.product}/${cols.category}`);
                                            await client.end();
                                            break;
                                        }
                                    }
                                }
                                catch (colError) {
                                    // Wrong column names, try next combination
                                    continue;
                                }
                            }
                            if (productCategoryLinksMap.size > 0) {
                                break; // Found links, exit
                            }
                        }
                        catch (e) {
                            // Table doesn't exist or query failed, try next
                            console.log(`Table ${tableName} query failed:`, e?.message);
                            continue;
                        }
                    }
                    if (productCategoryLinksMap.size === 0) {
                        console.log("No product-category links found via SQL. Trying retrieveProduct method for each product.");
                    }
                    await client.end();
                }
            }
            catch (sqlError) {
                console.log("Could not fetch product-category links via SQL:", sqlError?.message);
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
                });
                // Try to retrieve first product to see its structure
                try {
                    const sampleProduct = await productModuleService.retrieveProduct(products[0].id);
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
                    });
                }
                catch (e) {
                    console.log("Could not retrieve sample product:", e?.message);
                }
            }
            // Process products in batches - ALWAYS use retrieveProduct to get categories (most reliable)
            const batchSize = 30; // Increased batch size
            // Initialize persistent DB client for SQL fallbacks
            let persistentClient = null;
            let linkTableCache = null;
            try {
                if (process.env.DATABASE_URL) {
                    persistentClient = new pg_1.Client({ connectionString: process.env.DATABASE_URL });
                    await persistentClient.connect();
                }
            }
            catch (e) {
                console.log("Failed to connect persistent DB client:", e);
            }
            try {
                for (let i = 0; i < products.length; i += batchSize) {
                    const productBatch = products.slice(i, i + batchSize);
                    const batchPromises = productBatch.map(async (product) => {
                        try {
                            // Get variants for this product
                            const productVariants = variantsByProduct.get(product.id) || [];
                            // Get categories and collection - ALWAYS use retrieveProduct
                            let productCategories = [];
                            let productCollection = null;
                            try {
                                // Retrieve full product - try with relations first
                                let fullProduct;
                                try {
                                    fullProduct = await productModuleService.retrieveProduct(product.id, {
                                        relations: ["categories", "collection"],
                                    });
                                }
                                catch (e) {
                                    // Fallback without relations
                                    fullProduct = await productModuleService.retrieveProduct(product.id);
                                }
                                // Get categories - try multiple ways
                                let categoryIds = [];
                                // Method 1: Check fullProduct.categories array (if relations worked)
                                if (fullProduct.categories && Array.isArray(fullProduct.categories) && fullProduct.categories.length > 0) {
                                    // Categories are already objects, use them directly
                                    productCategories = fullProduct.categories.map((cat) => ({
                                        id: cat.id || cat.category_id || "",
                                        name: cat.name || cat.title || "Unknown",
                                        handle: cat.handle || "",
                                        commission: (cat.metadata?.affiliate_commission) || 0,
                                    })).filter((cat) => cat.id); // Filter out invalid entries
                                }
                                else if (fullProduct.category_ids && Array.isArray(fullProduct.category_ids)) {
                                    // Method 2: Use category_ids to look up in allCategories
                                    categoryIds = fullProduct.category_ids;
                                    productCategories = allCategories
                                        .filter((cat) => categoryIds.includes(cat.id))
                                        .map((cat) => ({
                                        id: cat.id,
                                        name: cat.name || "Unknown",
                                        handle: cat.handle || "",
                                        commission: (cat.metadata?.affiliate_commission) || 0,
                                    }));
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
                              `;
                                                const tableResult = await persistentClient.query(linkTableQuery);
                                                if (tableResult.rows && tableResult.rows.length > 0) {
                                                    linkTable = tableResult.rows[0].table_name;
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
                              `;
                                                const colResult = await persistentClient.query(colQuery, [linkTable]);
                                                const columns = colResult.rows.map((r) => r.column_name);
                                                const productCol = columns.find((c) => c.includes('product') && c.includes('id'));
                                                const categoryCol = columns.find((c) => c.includes('category') && c.includes('id'));
                                                if (productCol && categoryCol) {
                                                    const linkQuery = `SELECT ${categoryCol} as category_id FROM ${linkTable} WHERE ${productCol} = $1`;
                                                    const linkResult = await persistentClient.query(linkQuery, [product.id]);
                                                    if (linkResult.rows && linkResult.rows.length > 0) {
                                                        categoryIds = linkResult.rows.map((r) => r.category_id).filter(Boolean);
                                                        productCategories = allCategories
                                                            .filter((cat) => categoryIds.includes(cat.id))
                                                            .map((cat) => ({
                                                            id: cat.id,
                                                            name: cat.name || "Unknown",
                                                            handle: cat.handle || "",
                                                            commission: (cat.metadata?.affiliate_commission) || 0,
                                                        }));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    catch (sqlErr) {
                                        // SQL query failed, continue
                                    }
                                }
                                // Fallback: Check SQL link table map
                                if (productCategories.length === 0 && productCategoryLinksMap.has(product.id)) {
                                    categoryIds = productCategoryLinksMap.get(product.id) || [];
                                    productCategories = allCategories
                                        .filter((cat) => categoryIds.includes(cat.id))
                                        .map((cat) => ({
                                        id: cat.id,
                                        name: cat.name || "Unknown",
                                        handle: cat.handle || "",
                                        commission: (cat.metadata?.affiliate_commission) || 0,
                                    }));
                                }
                                // Get collection
                                if (fullProduct.collection) {
                                    productCollection = {
                                        id: fullProduct.collection.id || fullProduct.collection.collection_id || "",
                                        title: fullProduct.collection.title || fullProduct.collection.name || "Unknown",
                                        handle: fullProduct.collection.handle || "",
                                        commission: (fullProduct.collection.metadata?.affiliate_commission) || 0,
                                    };
                                }
                                else if (fullProduct.collection_id) {
                                    const foundCollection = allCollections.find((col) => col.id === fullProduct.collection_id);
                                    if (foundCollection) {
                                        productCollection = {
                                            id: foundCollection.id,
                                            title: foundCollection.title || "Unknown",
                                            handle: foundCollection.handle || "",
                                            commission: (foundCollection.metadata?.affiliate_commission) || 0,
                                        };
                                    }
                                }
                            }
                            catch (retrieveError) {
                                // If retrieveProduct fails, try fallbacks
                                console.log(`Could not retrieve product ${product.id}:`, retrieveError?.message);
                                // Fallback: Check SQL link table
                                if (productCategoryLinksMap.has(product.id)) {
                                    const categoryIds = productCategoryLinksMap.get(product.id) || [];
                                    productCategories = allCategories
                                        .filter((cat) => categoryIds.includes(cat.id))
                                        .map((cat) => ({
                                        id: cat.id,
                                        name: cat.name || "Unknown",
                                        handle: cat.handle || "",
                                        commission: (cat.metadata?.affiliate_commission) || 0,
                                    }));
                                }
                                // Fallback: Check product.collection_id
                                if (product.collection_id) {
                                    const foundCollection = allCollections.find((col) => col.id === product.collection_id);
                                    if (foundCollection) {
                                        productCollection = {
                                            id: foundCollection.id,
                                            title: foundCollection.title || "Unknown",
                                            handle: foundCollection.handle || "",
                                            commission: (foundCollection.metadata?.affiliate_commission) || 0,
                                        };
                                    }
                                }
                            }
                            // Get collection - check product.collection_id first (from listProducts)
                            let collectionId = null;
                            if (product.collection_id) {
                                collectionId = product.collection_id;
                                console.log(`Product ${product.id} has collection_id:`, collectionId);
                            }
                            // Try retrieveProduct if collection_id not found
                            if (!collectionId) {
                                try {
                                    const fullProduct = await productModuleService.retrieveProduct(product.id);
                                    if (fullProduct.collection) {
                                        collectionId = fullProduct.collection.id || fullProduct.collection.collection_id || null;
                                        console.log(`Product ${product.id} collection from retrieveProduct:`, collectionId);
                                    }
                                    else if (fullProduct.collection_id) {
                                        collectionId = fullProduct.collection_id;
                                        console.log(`Product ${product.id} collection_id from retrieveProduct:`, collectionId);
                                    }
                                }
                                catch (e) {
                                    console.log(`Could not retrieve product ${product.id} for collection:`, e?.message);
                                }
                            }
                            // Check metadata
                            if (!collectionId && product.metadata?.collection_id) {
                                collectionId = product.metadata.collection_id;
                                console.log(`Product ${product.id} collection_id from metadata:`, collectionId);
                            }
                            // Map collection ID to collection object
                            if (collectionId) {
                                const foundCollection = allCollections.find((col) => col.id === collectionId);
                                if (foundCollection) {
                                    productCollection = {
                                        id: foundCollection.id,
                                        title: foundCollection.title || "Unknown",
                                        handle: foundCollection.handle || "",
                                        commission: (foundCollection.metadata?.affiliate_commission) || 0,
                                    };
                                    console.log(`Product ${product.id} mapped to collection:`, productCollection.title);
                                }
                                else {
                                    console.log(`Product ${product.id} collection_id ${collectionId} not found in allCollections`);
                                }
                            }
                            else {
                                console.log(`Product ${product.id} has no collection`);
                            }
                            // Build product object with all data
                            const fullProduct = {
                                ...product,
                                variants: productVariants,
                                categories: productCategories,
                                collection: productCollection,
                            };
                            return fullProduct;
                        }
                        catch (error) {
                            console.log(`Error processing product ${product.id}:`, error?.message);
                            return {
                                ...product,
                                variants: variantsByProduct.get(product.id) || [],
                                categories: [],
                                collection: null,
                            };
                        }
                    });
                    const batchResults = await Promise.all(batchPromises);
                    productsWithVariants.push(...batchResults);
                }
            }
            finally {
                if (persistentClient) {
                    await persistentClient.end().catch(() => { });
                }
            }
            console.log(`Fetched ${productsWithVariants.length} products with relations`);
        }
        catch (queryError) {
            console.log("Query API error, using basic product data:", queryError?.message);
            // Fallback: use basic product data without relations (much faster)
            productsWithVariants = products.map((product) => ({
                ...product,
                variants: [],
                categories: [],
                collection: null,
            }));
        }
        console.log(`Total products processed: ${productsWithVariants.length}`);
        // Log sample product to debug structure
        if (productsWithVariants.length > 0) {
            const sample = productsWithVariants[0];
            console.log("Sample product structure:", {
                id: sample.id,
                title: sample.title,
                hasVariants: !!sample.variants,
                variantCount: Array.isArray(sample.variants) ? sample.variants.length : 0,
                hasCategories: !!sample.categories,
                categoryCount: Array.isArray(sample.categories) ? sample.categories.length : 0,
                hasCollection: !!sample.collection,
                collectionTitle: sample.collection?.title || sample.collection?.name,
            });
        }
        // Get inventory items for all product variants
        const variantIds = [];
        productsWithVariants.forEach((p) => {
            if (p.variants && Array.isArray(p.variants)) {
                p.variants.forEach((v) => {
                    if (v && v.id)
                        variantIds.push(v.id);
                });
            }
        });
        console.log(`Found ${variantIds.length} variants across ${productsWithVariants.length} products`);
        let inventoryMap = new Map();
        if (variantIds.length > 0) {
            try {
                const query = req.scope.resolve("query");
                // Get inventory items linked to variants through link table or SKU matching
                try {
                    // Get all inventory items
                    const { data: allInventoryItems } = await query.graph({
                        entity: "inventory_item",
                        fields: ["id", "sku"],
                    });
                    // Get variant-inventory links (try different possible link table names)
                    const linkTableNames = [
                        "product_variant_inventory_item",
                        "inventory_item_product_variant",
                        "product_variant_inventory_item_link",
                    ];
                    let variantInventoryLinks = [];
                    for (const tableName of linkTableNames) {
                        try {
                            const { data: links } = await query.graph({
                                entity: tableName,
                                fields: ["variant_id", "inventory_item_id"],
                                filters: {
                                    variant_id: variantIds,
                                },
                            });
                            if (links && links.length > 0) {
                                variantInventoryLinks = links;
                                console.log(`Found ${variantInventoryLinks.length} variant-inventory links using ${tableName}`);
                                break;
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Fallback: try to get inventory items by SKU matching variant SKU
                    if (variantInventoryLinks.length === 0) {
                        console.log("No link table found, trying SKU matching");
                        const variantSkuMap = new Map();
                        productsWithVariants.forEach((p) => {
                            (p.variants || []).forEach((v) => {
                                if (v.sku)
                                    variantSkuMap.set(v.sku, v.id);
                            });
                        });
                        if (allInventoryItems && allInventoryItems.length > 0) {
                            allInventoryItems.forEach((item) => {
                                if (item.sku && variantSkuMap.has(item.sku)) {
                                    variantInventoryLinks.push({
                                        variant_id: variantSkuMap.get(item.sku),
                                        inventory_item_id: item.id,
                                    });
                                }
                            });
                            console.log(`Found ${variantInventoryLinks.length} variant-inventory links via SKU matching`);
                        }
                    }
                    if (variantInventoryLinks.length > 0) {
                        const inventoryItemIds = [...new Set(variantInventoryLinks.map((link) => link.inventory_item_id).filter(Boolean))];
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
                        });
                        console.log(`Found ${inventoryLevels?.length || 0} inventory levels`);
                        // Create a map of inventory_item_id to total available quantity
                        const itemQuantityMap = new Map();
                        if (inventoryLevels && Array.isArray(inventoryLevels)) {
                            inventoryLevels.forEach((level) => {
                                const itemId = level.inventory_item_id;
                                const stocked = Number(level.stocked_quantity) || 0;
                                const reserved = Number(level.reserved_quantity) || 0;
                                const available = Math.max(0, stocked - reserved);
                                const existing = itemQuantityMap.get(itemId) || 0;
                                itemQuantityMap.set(itemId, existing + available);
                            });
                        }
                        // Map to variants
                        variantInventoryLinks.forEach((link) => {
                            const variantId = link.variant_id;
                            const itemId = link.inventory_item_id;
                            if (variantId && itemId) {
                                const availableQuantity = itemQuantityMap.get(itemId) || 0;
                                const existing = inventoryMap.get(variantId) || { quantity: 0 };
                                inventoryMap.set(variantId, {
                                    quantity: existing.quantity + availableQuantity,
                                    location_id: null,
                                });
                            }
                        });
                    }
                }
                catch (queryError) {
                    console.log("Query API inventory error:", queryError?.message);
                }
            }
            catch (error) {
                console.log("Inventory error:", error?.message || error);
            }
        }
        // Fallback: use variant inventory_quantity if available and no inventory data found
        productsWithVariants.forEach((product) => {
            (product.variants || []).forEach((variant) => {
                if (!inventoryMap.has(variant.id)) {
                    // Try to get from variant metadata or direct property
                    const variantInventory = variant.inventory_quantity ||
                        variant.metadata?.inventory_quantity ||
                        0;
                    inventoryMap.set(variant.id, {
                        quantity: Number(variantInventory) || 0,
                        location_id: null,
                    });
                }
            });
        });
        console.log(`Inventory map created with ${inventoryMap.size} variants`);
        if (inventoryMap.size > 0) {
            const sampleEntries = Array.from(inventoryMap.entries()).slice(0, 5);
            console.log(`Sample inventory data:`, sampleEntries);
            const totalQty = Array.from(inventoryMap.values()).reduce((sum, inv) => sum + (inv.quantity || 0), 0);
            console.log(`Total inventory quantity across all variants:`, totalQty);
        }
        else {
            console.log("WARNING: No inventory data found for any variants!");
        }
        // Fetch all commissions from database
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        let allCommissions = [];
        try {
            allCommissions = await affiliateService.listAffiliateCommissions({}) || [];
            console.log(`Loaded ${allCommissions.length} commission settings from database`);
        }
        catch (error) {
            console.log("Error fetching commissions (table may not exist yet):", error?.message);
            allCommissions = [];
        }
        // Create commission maps for quick lookup
        const productCommissionMap = new Map();
        const categoryCommissionMap = new Map();
        const collectionCommissionMap = new Map();
        const typeCommissionMap = new Map();
        allCommissions.forEach((comm) => {
            if (comm.product_id) {
                productCommissionMap.set(comm.product_id, comm.commission_rate);
            }
            else if (comm.category_id) {
                categoryCommissionMap.set(comm.category_id, comm.commission_rate);
            }
            else if (comm.collection_id) {
                collectionCommissionMap.set(comm.collection_id, comm.commission_rate);
            }
            else if (comm.type_id) {
                typeCommissionMap.set(comm.type_id, comm.commission_rate);
            }
        });
        // Format products with commission and inventory data
        const formattedProducts = productsWithVariants.map((product) => {
            try {
                // Get variants - handle cases where variants might not be loaded
                const productVariants = Array.isArray(product.variants) ? product.variants : [];
                const variants = productVariants.map((variant) => {
                    if (!variant || !variant.id)
                        return null;
                    const inventory = inventoryMap.get(variant.id) || { quantity: variant.inventory_quantity || 0, location_id: null };
                    // Get price from variant prices array or calculated price
                    // Keep price as-is, no division
                    let price = 0;
                    if (variant.calculated_price) {
                        price = Number(variant.calculated_price);
                    }
                    else if (variant.original_price) {
                        price = Number(variant.original_price);
                    }
                    else if (variant.prices && Array.isArray(variant.prices) && variant.prices.length > 0) {
                        price = Number(variant.prices[0].amount || 0);
                    }
                    return {
                        id: variant.id,
                        title: variant.title || product.title || "Untitled",
                        sku: variant.sku || "N/A",
                        inventory_quantity: inventory.quantity,
                        price: price,
                    };
                }).filter((v) => v !== null);
                const totalInventory = variants.reduce((sum, v) => sum + (v?.inventory_quantity || 0), 0);
                const inStock = totalInventory > 0;
                // Safely access categories, collection, tags, type (must be declared before use)
                const categories = Array.isArray(product.categories)
                    ? product.categories.map((cat) => ({
                        id: cat?.id || cat?.category_id || "",
                        name: cat?.name || cat?.title || "Unknown",
                        handle: cat?.handle || "",
                        commission: (cat?.metadata?.affiliate_commission) || 0,
                    }))
                    : [];
                const collection = product.collection && typeof product.collection === 'object'
                    ? {
                        id: product.collection.id || product.collection.collection_id || "",
                        title: product.collection.title || product.collection.name || "Unknown",
                        handle: product.collection.handle || "",
                        commission: (product.collection.metadata?.affiliate_commission) || 0,
                    }
                    : null;
                const tags = Array.isArray(product.tags)
                    ? product.tags.map((tag) => ({
                        id: tag?.id || tag?.tag_id || "",
                        value: tag?.value || "",
                    }))
                    : [];
                const type = product.type && typeof product.type === 'object'
                    ? {
                        id: product.type.id || product.type.type_id || "",
                        value: product.type.value || "",
                    }
                    : null;
                // Get commission with priority: product > category > collection > type > metadata
                let commission = 0;
                // Check product-specific commission first
                if (productCommissionMap.has(product.id)) {
                    commission = productCommissionMap.get(product.id);
                }
                else if (categories.length > 0) {
                    // Check category commissions (first match)
                    for (const cat of categories) {
                        if (categoryCommissionMap.has(cat.id)) {
                            commission = categoryCommissionMap.get(cat.id);
                            break;
                        }
                    }
                }
                // Check collection commission
                if (commission === 0 && collection && collectionCommissionMap.has(collection.id)) {
                    commission = collectionCommissionMap.get(collection.id);
                }
                // Check type commission
                if (commission === 0 && type && typeCommissionMap.has(type.id)) {
                    commission = typeCommissionMap.get(type.id);
                }
                // Fallback to metadata
                if (commission === 0) {
                    const metadata = product.metadata || {};
                    commission = metadata.affiliate_commission ||
                        metadata.commission ||
                        (product.collection?.metadata?.affiliate_commission) ||
                        (product.categories?.[0]?.metadata?.affiliate_commission) ||
                        0;
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
                };
            }
            catch (error) {
                console.error(`Error formatting product ${product.id}:`, error);
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
                };
            }
        });
        // Get unique categories, collections, and types for filters
        const categories = Array.from(new Map(formattedProducts.flatMap((p) => (p.categories || []).map((cat) => [cat.id, {
                id: cat.id,
                name: cat.name,
                handle: cat.handle,
                commission: cat.commission || 0,
            }]))).values());
        const collections = Array.from(new Map(formattedProducts
            .filter((p) => p.collection)
            .map((p) => [p.collection.id, {
                id: p.collection.id,
                title: p.collection.title,
                handle: p.collection.handle,
                commission: p.collection.commission || 0,
            }])).values());
        const types = Array.from(new Map(formattedProducts
            .filter((p) => p.type)
            .map((p) => [p.type.id, {
                id: p.type.id,
                value: p.type.value,
            }])).values());
        return res.json({
            products: formattedProducts,
            filters: {
                categories,
                collections,
                types,
            },
            stats: {
                total: formattedProducts.length,
                in_stock: formattedProducts.filter((p) => p.in_stock).length,
                out_of_stock: formattedProducts.filter((p) => !p.in_stock).length,
            },
        });
    }
    catch (error) {
        console.error("Get products error:", error);
        return res.status(500).json({
            message: "Failed to fetch products",
            error: error?.message || String(error),
            products: [],
            filters: { categories: [], collections: [], types: [] },
            stats: { total: 0, in_stock: 0, out_of_stock: 0 },
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FmZmlsaWF0ZS9hZG1pbi9wcm9kdWN0cy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXFDQSwwQkFHQztBQUVELGtCQWs2QkM7QUEzOEJELHFEQUFtRDtBQUNuRCw0Q0FBdUQ7QUFFdkQsNkRBQWdFO0FBQ2hFLDJCQUEyQjtBQUUzQixzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUIsRUFBRSxHQUFtQjtJQUM5RCxNQUFNLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUE7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNLENBQUMsQ0FBQTtJQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVELCtCQUErQjtBQUMvQixLQUFLLFVBQVUsMEJBQTBCLENBQUMsR0FBa0I7SUFDMUQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDNUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ3JDLE1BQU0sTUFBTSxHQUFHLElBQUEsNEJBQW9CLEVBQUMsS0FBSyxD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