"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureOptionsForVariants = ensureOptionsForVariants;
exports.runMigration = runMigration;
const path_1 = __importDefault(require("path"));
const axios_1 = __importStar(require("axios"));
const pg_1 = require("pg");
const config_1 = require("./config");
const job_manager_1 = require("./job-manager");
const logger_1 = require("./logger");
const mysql_client_1 = require("./mysql-client");
const image_pipeline_1 = require("./image-pipeline");
const utils_1 = require("./utils");
const image_resolver_1 = require("./image-resolver");
const html_cleaner_1 = require("./html-cleaner");
const DEFAULT_SAMPLE_SIZE = 100;
const MAX_PRODUCT_IMAGES = 8;
const RESEED_ENABLED = (process.env.RESEED ?? "").trim().toLowerCase() === "true";
const parseResolverConcurrency = () => {
    const fallback = Number(config_1.config.worker.imageConcurrency ?? 4);
    const parsed = Number(process.env.CONCURRENCY ?? fallback);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return fallback > 0 ? fallback : 4;
};
function createConcurrencyLimiter(limit) {
    const max = Math.max(1, limit);
    let activeCount = 0;
    const queue = [];
    const next = () => {
        while (activeCount < max && queue.length) {
            const task = queue.shift();
            if (!task) {
                continue;
            }
            activeCount += 1;
            task();
        }
    };
    return (task) => new Promise((resolve, reject) => {
        const run = () => {
            task()
                .then(resolve, reject)
                .finally(() => {
                activeCount -= 1;
                next();
            });
        };
        queue.push(run);
        next();
    });
}
const resolveLimit = createConcurrencyLimiter(parseResolverConcurrency());
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function uniq(arr) {
    return Array.from(new Set(arr));
}
// --- inventory helpers ------------------------------------------------------
async function ensureDefaultLocation(admin) {
    const name = "Default";
    try {
        const { data } = await admin.get("/admin/stock-locations", {
            params: { q: name, limit: 1 },
        });
        const existing = data?.stock_locations?.[0];
        if (existing?.id) {
            return existing.id;
        }
    }
    catch (error) {
        if ((0, axios_1.isAxiosError)(error) && error.response?.status === 404) {
            throw new Error("Inventory module not enabled (stock-locations 404). Ensure you're on Medusa v2 and inventory modules are installed.");
        }
        throw error;
    }
    const { data } = await admin.post("/admin/stock-locations", { name });
    return data.stock_location.id;
}
async function deleteIfExistsByHandle(admin, handle) {
    if (!handle) {
        return;
    }
    try {
        const { data } = await admin.get("/admin/products", {
            params: { q: handle, limit: 1 },
        });
        const existing = data?.products?.find((p) => p?.handle === handle);
        if (!existing?.id) {
            return;
        }
        await admin.delete(`/admin/products/${existing.id}`);
    }
    catch (error) {
        if ((0, axios_1.isAxiosError)(error) && error.response?.status === 404) {
            return;
        }
        throw error;
    }
}
async function createInventoryItemForVariant(admin, variantId, sku, metadata) {
    const { data } = await admin.post("/admin/inventory-items", {
        sku,
        metadata,
    });
    const inventoryItemId = data?.inventory_item?.id;
    if (!inventoryItemId) {
        throw new Error(`Failed to create inventory item for variant ${variantId} (sku=${sku})`);
    }
    await admin.post(`/admin/variants/${variantId}/inventory-items`, {
        inventory_item_id: inventoryItemId,
        required: true,
    });
    return inventoryItemId;
}
async function setLocationLevel(admin, inventoryItemId, locationId, quantity) {
    try {
        // Try to create the location level
        await admin.post(`/admin/inventory-items/${inventoryItemId}/location-levels`, {
            location_id: locationId,
            stocked_quantity: quantity,
        });
    }
    catch (error) {
        // If it already exists, try to update it
        if (error.response?.status === 400 || error.response?.status === 409) {
            await admin.post(`/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`, {
                stocked_quantity: quantity,
            });
        }
        else {
            throw error;
        }
    }
}
async function updateInventoryDimensions(admin, inventoryItemId, dimensions) {
    if (!Object.keys(dimensions).length) {
        return;
    }
    await admin.post(`/admin/inventory-items/${inventoryItemId}`, dimensions);
}
async function getDefaultSalesChannelId(admin) {
    const { data } = await admin.get("/admin/sales-channels", {
        params: { limit: 1 },
    });
    const id = data?.sales_channels?.[0]?.id;
    return id ?? null;
}
async function addProductToSalesChannel(admin, productId, salesChannelId) {
    await admin.post(`/admin/products/${productId}/sales-channels/batch`, {
        add: [salesChannelId],
    });
}
async function upsertCollection(context, title) {
    const cacheKey = title.toLowerCase();
    const cached = context.collectionCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const admin = context.medusaClient;
    if (!admin) {
        throw new Error("Medusa client unavailable");
    }
    const { data } = await admin.get("/admin/collections", {
        params: { q: title, limit: 1 },
    });
    const existing = data?.collections?.[0];
    if (existing?.id) {
        context.collectionCache.set(cacheKey, existing.id);
        return existing.id;
    }
    const response = await admin.post("/admin/collections", { title });
    const id = response.data?.collection?.id;
    if (!id) {
        throw new Error(`Failed to create collection "${title}"`);
    }
    context.collectionCache.set(cacheKey, id);
    return id;
}
async function upsertType(context, value) {
    const cacheKey = value.toLowerCase();
    const cached = context.typeCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const admin = context.medusaClient;
    if (!admin) {
        throw new Error("Medusa client unavailable");
    }
    const { data } = await admin.get("/admin/product-types", {
        params: { q: value, limit: 1 },
    });
    const existing = data?.product_types?.[0];
    if (existing?.id) {
        context.typeCache.set(cacheKey, existing.id);
        return existing.id;
    }
    const response = await admin.post("/admin/product-types", { value });
    const id = response.data?.product_type?.id;
    if (!id) {
        throw new Error(`Failed to create product type "${value}"`);
    }
    context.typeCache.set(cacheKey, id);
    return id;
}
async function upsertCategory(context, title, handle, parentId) {
    const cacheKey = `${parentId ?? "root"}:${handle}`;
    const cached = context.categoryCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const admin = context.medusaClient;
    if (!admin) {
        throw new Error("Medusa client unavailable");
    }
    const { data } = await admin.get("/admin/product-categories", {
        params: { q: title, limit: 1 },
    });
    const existing = data?.product_categories?.find((c) => c?.handle === handle || c?.name === title);
    if (existing?.id) {
        context.categoryCache.set(cacheKey, existing.id);
        return existing.id;
    }
    const response = await admin.post("/admin/product-categories", {
        name: title,
        handle,
        parent_category_id: parentId,
    });
    const id = response.data?.product_category?.id;
    if (!id) {
        throw new Error(`Failed to create category "${title}"`);
    }
    context.categoryCache.set(cacheKey, id);
    return id;
}
function toCm(value, unit) {
    if (value == null || value === 0) {
        return undefined;
    }
    if (!unit) {
        // Default to cm if no unit specified
        return Math.round(value * 10) / 10; // Keep one decimal
    }
    const normalized = unit.toLowerCase();
    if (normalized.includes("cm") || normalized.includes("centimeter")) {
        // Already in cm
        return Math.round(value * 10) / 10;
    }
    if (normalized.includes("mm") || normalized.includes("millimeter")) {
        // Convert mm to cm
        return Math.round((value / 10) * 10) / 10;
    }
    if (normalized.includes("m") &&
        !normalized.includes("mm") &&
        !normalized.includes("cm")) {
        // Convert m to cm
        return Math.round(value * 100 * 10) / 10;
    }
    // Default to cm
    return Math.round(value * 10) / 10;
}
function toKg(value, unit) {
    if (value == null || value === 0) {
        return undefined;
    }
    if (!unit) {
        // Default to kg if no unit specified
        return Math.round(value * 100) / 100; // Keep two decimals
    }
    const normalized = unit.toLowerCase();
    if (normalized.includes("kg") || normalized.includes("kilogram")) {
        // Already in kg
        return Math.round(value * 100) / 100;
    }
    if (normalized.includes("g") && !normalized.includes("kg")) {
        // Convert grams to kg
        return Math.round((value / 1000) * 100) / 100;
    }
    // Default to kg
    return Math.round(value * 100) / 100;
}
// Keep old functions for inventory items (Medusa expects mm/g for inventory)
function toMm(value, unit) {
    if (value == null || value === 0) {
        return undefined;
    }
    if (!unit) {
        return Math.round(value);
    }
    const normalized = unit.toLowerCase();
    if (normalized.includes("cm") || normalized.includes("centimeter")) {
        return Math.round(value * 10);
    }
    if (normalized.includes("m") && !normalized.includes("mm")) {
        return Math.round(value * 1000);
    }
    return Math.round(value);
}
function toGrams(value, unit) {
    if (value == null || value === 0) {
        return undefined;
    }
    if (!unit) {
        return Math.round(value);
    }
    const normalized = unit.toLowerCase();
    if (normalized.includes("kg") || normalized.includes("kilogram")) {
        return Math.round(value * 1000);
    }
    return Math.round(value);
}
function toRupees(input) {
    if (input == null)
        return 0;
    const raw = String(input).trim();
    if (!raw)
        return 0;
    const cleaned = raw.replace(/[₹,\s]/g, "");
    const rupees = Number.parseFloat(cleaned);
    if (!Number.isFinite(rupees))
        return 0;
    return Math.round(rupees);
}
function resolveFinalPriceRupees(regularRupees, specialRupees) {
    const regularAmount = toRupees(regularRupees);
    const specialAmount = toRupees(specialRupees ?? "");
    const amount = specialAmount > 0 && specialAmount < regularAmount
        ? specialAmount
        : regularAmount;
    const discountPercent = amount < regularAmount && regularAmount > 0
        ? Math.round(((regularAmount - amount) / regularAmount) * 100)
        : 0;
    return { amount, regularAmount, discountPercent };
}
function isSpecialActive(special) {
    if (!special?.price) {
        return false;
    }
    const now = Date.now();
    const startOk = !special.date_start || new Date(special.date_start).getTime() <= now;
    const endOk = !special.date_end || new Date(special.date_end).getTime() >= now;
    return startOk && endOk;
}
function collectOptionValues(variants, key) {
    const values = new Set();
    for (const variant of variants) {
        const optionValue = variant.options?.[key];
        if (optionValue) {
            values.add(optionValue);
        }
    }
    if (!values.size) {
        values.add("Default");
    }
    return Array.from(values);
}
function ensureOptionsForVariants(payload, sourceName) {
    if (!payload.variants?.length) {
        return;
    }
    const capacity = normalizeCapacity(extractCapacity(sourceName));
    if (capacity) {
        payload.variants = payload.variants.map((variant) => ({
            ...variant,
            options: { Capacity: capacity },
        }));
        payload.options = [
            {
                title: "Capacity",
                values: collectOptionValues(payload.variants, "Capacity"),
            },
        ];
        return;
    }
    payload.variants = payload.variants.map((variant) => {
        const value = (variant.title ?? "Default").trim() || "Default";
        return {
            ...variant,
            options: { Title: value },
        };
    });
    payload.options = [
        {
            title: "Title",
            values: collectOptionValues(payload.variants, "Title"),
        },
    ];
}
function extractCapacity(name) {
    const match = name.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liters?|litres?)/i);
    return match ? `${match[1]} L` : null;
}
function normalizeCapacity(value) {
    if (!value) {
        return null;
    }
    return value
        .replace(/\s+/g, " ")
        .trim()
        .replace(/l(it(er|re))?s?$/i, "L");
}
async function loadMapping(mappingPath) {
    if (!mappingPath) {
        throw new Error("Mapping path not provided. Generate mapping via /discover or supply OPENCART_ETL_MAPPING.");
    }
    const data = await (0, utils_1.readJson)(mappingPath);
    if (!data) {
        throw new Error(`Mapping file missing or invalid: ${mappingPath}`);
    }
    return data;
}
function createMedusaClient() {
    const configured = (config_1.config.medusa.adminUrl || config_1.MEDUSA_URL).trim();
    const baseHost = configured.replace(/\/admin\/?$/i, "");
    const base = baseHost.replace(/\/$/, "");
    return axios_1.default.create({
        baseURL: base,
        headers: (0, config_1.adminHeaders)(),
        timeout: 30000,
    });
}
async function initPostgresPool() {
    if (!config_1.config.postgres.uri) {
        return null;
    }
    return new pg_1.Pool({
        connectionString: config_1.config.postgres.uri,
        ssl: config_1.config.postgres.ssl ? { rejectUnauthorized: false } : false,
    });
}
async function loadCheckpoint(checkpointPath) {
    const data = await (0, utils_1.readJson)(checkpointPath);
    if (!data) {
        return {
            processed: 0,
            succeeded: 0,
            failed: 0,
            imagesUploaded: 0,
            imagesFailed: 0,
        };
    }
    return data;
}
async function persistCheckpoint(checkpointPath, state) {
    await (0, utils_1.writeJson)(checkpointPath, state);
}
async function fetchProductsBatch(lastId, limit) {
    const whereClause = lastId ? `WHERE p.product_id > ?` : "";
    const sql = `
    SELECT
      p.product_id,
      pd.name,
      p.model,
      p.sku,
      p.upc,
      p.ean,
      p.jan,
      p.isbn,
      p.mpn,
      p.quantity,
      p.price,
      ps.price AS special_price,
      ps.date_start AS special_price_start,
      ps.date_end AS special_price_end,
      pd.description,
      p.image,
      p.manufacturer_id,
      m.name AS manufacturer_name,
      p.length,
      p.width,
      p.height,
      p.length_class_id,
      lcd.title AS length_class_title,
      p.weight,
      p.weight_class_id,
      wcd.title AS weight_class_title
    FROM ${config_1.config.mysql.tablePrefix}product p
    INNER JOIN ${config_1.config.mysql.tablePrefix}product_description pd
      ON pd.product_id = p.product_id
      AND pd.language_id = ?
    LEFT JOIN ${config_1.config.mysql.tablePrefix}product_special ps
      ON ps.product_id = p.product_id
      AND (ps.date_start IS NULL OR ps.date_start <= CURDATE())
      AND (ps.date_end IS NULL OR ps.date_end >= CURDATE())
    LEFT JOIN ${config_1.config.mysql.tablePrefix}manufacturer m
      ON m.manufacturer_id = p.manufacturer_id
    LEFT JOIN ${config_1.config.mysql.tablePrefix}length_class_description lcd
      ON lcd.length_class_id = p.length_class_id
      AND lcd.language_id = ?
    LEFT JOIN ${config_1.config.mysql.tablePrefix}weight_class_description wcd
      ON wcd.weight_class_id = p.weight_class_id
      AND wcd.language_id = ?
    ${whereClause}
    ORDER BY p.product_id
    LIMIT ?
  `;
    if (lastId) {
        return (0, mysql_client_1.runQuery)(sql, [
            config_1.config.mysql.languageId,
            config_1.config.mysql.languageId,
            config_1.config.mysql.languageId,
            lastId,
            limit,
        ]);
    }
    return (0, mysql_client_1.runQuery)(sql, [
        config_1.config.mysql.languageId,
        config_1.config.mysql.languageId,
        config_1.config.mysql.languageId,
        limit,
    ]);
}
async function fetchProductImages(productId) {
    const sql = `
    SELECT image
    FROM ${config_1.config.mysql.tablePrefix}product_image
    WHERE product_id = ?
    ORDER BY sort_order ASC
  `;
    const rows = await (0, mysql_client_1.runQuery)(sql, [productId]);
    return rows.map((row) => row.image).filter(Boolean);
}
// Tries multiple OpenCart variants; returns string[]
async function fetchProductTags(_conn, productId) {
    const productTagTable = `${config_1.config.mysql.tablePrefix}product_tag`;
    const productDescriptionTable = `${config_1.config.mysql.tablePrefix}product_description`;
    const productToTagTable = `${config_1.config.mysql.tablePrefix}product_to_tag`;
    try {
        const primaryRows = await (0, mysql_client_1.runQuery)(`SELECT tag FROM ${productTagTable} WHERE product_id = ?`, [productId]);
        if (Array.isArray(primaryRows) && primaryRows.length) {
            return primaryRows
                .map((row) => (row?.tag ?? "").toString().trim())
                .filter(Boolean);
        }
    }
    catch (error) {
        const code = error?.code ?? error?.errno;
        const message = String(error?.message ?? "");
        const isMissingTable = code === "ER_NO_SUCH_TABLE" ||
            message.includes("doesn't exist") ||
            message.includes("does not exist");
        if (!isMissingTable) {
            throw error;
        }
    }
    try {
        const fallbackRows = await (0, mysql_client_1.runQuery)(`SELECT tag FROM ${productDescriptionTable} WHERE product_id = ?`, [productId]);
        const joined = (fallbackRows || [])
            .map((row) => (row?.tag ?? "").toString().trim())
            .filter(Boolean)
            .join(",");
        if (joined.trim()) {
            return joined
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);
        }
    }
    catch {
        // ignore fallback errors
    }
    try {
        const altRows = await (0, mysql_client_1.runQuery)(`SELECT tag FROM ${productToTagTable} WHERE product_id = ?`, [productId]);
        if (Array.isArray(altRows) && altRows.length) {
            return altRows
                .map((row) => (row?.tag ?? "").toString().trim())
                .filter(Boolean);
        }
    }
    catch {
        // ignore
    }
    return [];
}
async function ensureTagRefs(context, tagValues) {
    const admin = context.medusaClient;
    if (!admin) {
        return [];
    }
    const cleaned = uniq((tagValues || [])
        .map((value) => (value ?? "").toString().trim())
        .filter(Boolean));
    const resolved = [];
    for (const value of cleaned) {
        const key = value.toLowerCase();
        const cachedId = context.tagCache.get(key);
        if (cachedId) {
            resolved.push({ id: cachedId });
            continue;
        }
        try {
            const search = await admin.get("/admin/product-tags", {
                params: { q: value, limit: 5 },
            });
            const existing = (search.data?.product_tags ?? []).find((tag) => typeof tag?.value === "string" &&
                tag.value.toLowerCase() === key &&
                tag?.id);
            if (existing?.id) {
                context.tagCache.set(key, existing.id);
                resolved.push({ id: existing.id });
                continue;
            }
        }
        catch (error) {
            await logger_1.logger.warn({
                jobId: context.jobId,
                step: "migrate",
                message: `Failed to search tag "${value}"`,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        try {
            const created = await admin.post("/admin/product-tags", { value });
            const newTag = created.data?.product_tag ??
                (Array.isArray(created.data?.product_tags)
                    ? created.data.product_tags[0]
                    : undefined);
            if (!newTag?.id) {
                throw new Error("Medusa tag create response missing id");
            }
            context.tagCache.set(key, newTag.id);
            resolved.push({ id: newTag.id });
        }
        catch (error) {
            await logger_1.logger.warn({
                jobId: context.jobId,
                step: "migrate",
                message: `Failed to create tag "${value}"`,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return resolved;
}
// Prefer a primary category if the column exists; otherwise pick the shallowest path / lowest sort_order
async function fetchPrimaryCategoryId(productId) {
    const productToCategoryTable = `${config_1.config.mysql.tablePrefix}product_to_category`;
    const categoryTable = `${config_1.config.mysql.tablePrefix}category`;
    const categoryPathTable = `${config_1.config.mysql.tablePrefix}category_path`;
    const hasMainColumn = await (0, mysql_client_1.runQuery)(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'main_category'
    `, [productToCategoryTable]);
    if ((hasMainColumn?.[0]?.cnt ?? 0) > 0) {
        const rows = await (0, mysql_client_1.runQuery)(`
        SELECT ptc.category_id
        FROM ${productToCategoryTable} ptc
        WHERE ptc.product_id = ?
        ORDER BY ptc.main_category DESC, ptc.category_id ASC
        LIMIT 1
      `, [productId]);
        return rows?.[0]?.category_id ?? null;
    }
    const rows = await (0, mysql_client_1.runQuery)(`
      SELECT ptc.category_id
      FROM ${productToCategoryTable} ptc
      LEFT JOIN ${categoryPathTable} cp ON cp.category_id = ptc.category_id
      LEFT JOIN ${categoryTable} c ON c.category_id = ptc.category_id
      WHERE ptc.product_id = ?
      GROUP BY ptc.category_id, c.sort_order
      ORDER BY MIN(cp.level) ASC, c.sort_order ASC, ptc.category_id ASC
      LIMIT 1
    `, [productId]);
    return rows?.[0]?.category_id ?? null;
}
async function fetchCategoryPath(categoryId) {
    const sql = `
    SELECT
      cp.level,
      c.category_id,
      c.parent_id,
      cd.name
    FROM ${config_1.config.mysql.tablePrefix}category_path cp
    INNER JOIN ${config_1.config.mysql.tablePrefix}category c
      ON c.category_id = cp.path_id
    INNER JOIN ${config_1.config.mysql.tablePrefix}category_description cd
      ON cd.category_id = cp.path_id
      AND cd.language_id = ?
    WHERE cp.category_id = ?
    ORDER BY cp.level ASC
  `;
    const rows = await (0, mysql_client_1.runQuery)(sql, [
        config_1.config.mysql.languageId,
        categoryId,
    ]);
    if (!rows.length) {
        return null;
    }
    return rows.map((row) => ({
        id: row.category_id,
        name: row.name,
        parentId: row.parent_id ?? null,
    }));
}
async function fetchAllCategoryIds(productId) {
    const sql = `
    SELECT category_id
    FROM ${config_1.config.mysql.tablePrefix}product_to_category
    WHERE product_id = ?
  `;
    const rows = await (0, mysql_client_1.runQuery)(sql, [productId]);
    return (rows ?? []).map((row) => row.category_id).filter(Boolean);
}
async function fetchAllCategoryPaths(categoryIds) {
    const paths = [];
    for (const id of categoryIds) {
        const path = await fetchCategoryPath(id);
        if (path && path.length) {
            paths.push(path);
        }
    }
    return paths;
}
const KEYWORD_CATEGORY_FALLBACK = [
    {
        rx: /\bpressure\s*cooker\b/i,
        trail: ["Kitchen Appliances", "Pressure Cookers"],
    },
    {
        rx: /\bcooker\b/i,
        trail: ["Kitchen Appliances", "Pressure Cookers"],
    },
];
async function ensureCategoryTrail(context, names) {
    const ids = [];
    let parent;
    for (const name of names) {
        const handle = slugify(name);
        const id = await upsertCategory(context, name, handle, parent);
        ids.push(id);
        parent = id;
    }
    return ids;
}
async function buildProductImages(context, productId, rawImages) {
    const filtered = rawImages
        .map((value) => (value ?? "").trim())
        .filter((value) => Boolean(value));
    if (!filtered.length) {
        const fallback = (0, image_resolver_1.placeholderUrl)();
        return {
            thumbnail: fallback,
            images: [fallback],
            resolved: [
                {
                    raw: "",
                    url: fallback,
                    reason: "placeholder",
                    attempts: [],
                },
            ],
        };
    }
    const tasks = filtered.map((raw) => resolveLimit(async () => {
        const result = await (0, image_resolver_1.resolveImageUrl)(raw);
        return { raw, ...result };
    }));
    const seen = new Set();
    const ordered = [];
    const resolved = [];
    for (const task of tasks) {
        const detail = await task;
        resolved.push(detail);
        if (!detail.url) {
            continue;
        }
        if (!seen.has(detail.url)) {
            seen.add(detail.url);
            ordered.push(detail.url);
            if (ordered.length >= MAX_PRODUCT_IMAGES) {
                break;
            }
        }
    }
    if (!ordered.length) {
        const fallback = (0, image_resolver_1.placeholderUrl)();
        resolved.push({
            raw: "",
            url: fallback,
            reason: "placeholder",
            attempts: [],
        });
        ordered.push(fallback);
    }
    if (!ordered.length) {
        throw new Error(`Unable to resolve images for product ${productId}`);
    }
    if (resolved.some((entry) => entry.reason === "placeholder")) {
        await logger_1.logger.warn({
            jobId: context.jobId,
            step: "image",
            message: `Placeholder image applied`,
            productId,
            rawImages: filtered,
        });
    }
    return {
        thumbnail: ordered[0],
        images: ordered,
        resolved,
    };
}
async function createMedusaProduct(context, product, media) {
    if (!context.medusaClient) {
        return;
    }
    const admin = context.medusaClient;
    const baseHandle = slugify(product.name) || "product";
    const handle = `${baseHandle}-${product.product_id}`;
    const baseSku = (product.sku ?? product.model ?? `oc-${product.product_id}`)?.trim() ||
        `oc-${product.product_id}`;
    const brand = product.manufacturer_name?.trim() || null;
    const primaryCategoryId = await fetchPrimaryCategoryId(product.product_id);
    const categoryPath = primaryCategoryId
        ? await fetchCategoryPath(primaryCategoryId)
        : null;
    const srcTagsArray = await fetchProductTags(null, product.product_id);
    const isDraft = Boolean(context.dryRun || config_1.config.medusa.dryRun);
    const productStatus = isDraft ? "draft" : "published";
    const sourceVariantsBySku = new Map();
    sourceVariantsBySku.set(baseSku.toLowerCase(), {
        qty: Number(product.quantity ?? 0),
        length: product.length,
        width: product.width,
        height: product.height,
        lengthUnit: product.length_class_title,
        weight: product.weight,
        weightUnit: product.weight_class_title,
    });
    const metadata = {
        source: "opencart",
        oc_product_id: String(product.product_id),
        oc_qty: Number(product.quantity ?? 0),
        oc_price_rupees: product.price,
    };
    if (product.model) {
        metadata.oc_model = product.model;
    }
    if (product.sku) {
        metadata.oc_sku = product.sku;
    }
    if (product.upc) {
        metadata.oc_upc = product.upc;
    }
    if (product.ean) {
        metadata.oc_ean = product.ean;
    }
    if (product.jan) {
        metadata.oc_jan = product.jan;
    }
    if (product.isbn) {
        metadata.oc_isbn = product.isbn;
    }
    if (product.mpn) {
        metadata.oc_mpn = product.mpn;
    }
    if (product.special_price) {
        metadata.oc_special_price_rupees = product.special_price;
    }
    if (product.length_class_title) {
        metadata.oc_length_unit = product.length_class_title;
    }
    if (product.weight_class_title) {
        metadata.oc_weight_unit = product.weight_class_title;
    }
    // Add dimensions to metadata for reference
    // Store in both original units and standardized units (cm/kg)
    if (product.length != null && product.length > 0) {
        metadata.length = product.length;
        metadata.length_unit = product.length_class_title || "cm";
        metadata.length_cm = toCm(product.length, product.length_class_title);
    }
    if (product.width != null && product.width > 0) {
        metadata.width = product.width;
        metadata.width_cm = toCm(product.width, product.length_class_title);
    }
    if (product.height != null && product.height > 0) {
        metadata.height = product.height;
        metadata.height_cm = toCm(product.height, product.length_class_title);
    }
    if (product.weight != null && product.weight > 0) {
        metadata.weight = product.weight;
        metadata.weight_unit = product.weight_class_title || "kg";
        metadata.weight_kg = toKg(product.weight, product.weight_class_title);
    }
    if (brand) {
        metadata.oc_brand = brand;
    }
    const categoryIdsAll = await fetchAllCategoryIds(product.product_id);
    const allPaths = categoryIdsAll.length
        ? await fetchAllCategoryPaths(categoryIdsAll)
        : categoryPath
            ? [categoryPath]
            : [];
    if (allPaths.length) {
        metadata.oc_category_path = allPaths.map((path) => path.map((node) => node.name));
    }
    if (srcTagsArray.length) {
        metadata.oc_tags = srcTagsArray;
    }
    // Convert dimensions for product attributes (cm and kg for UI display)
    const lengthCm = product.length != null && product.length > 0
        ? toCm(product.length, product.length_class_title)
        : undefined;
    const widthCm = product.width != null && product.width > 0
        ? toCm(product.width, product.length_class_title)
        : undefined;
    const heightCm = product.height != null && product.height > 0
        ? toCm(product.height, product.length_class_title)
        : undefined;
    const weightKg = product.weight != null && product.weight > 0
        ? toKg(product.weight, product.weight_class_title)
        : undefined;
    const payload = {
        title: product.name,
        handle,
        description: (0, html_cleaner_1.cleanHtml)(product.description || ""),
        status: productStatus,
        thumbnail: media.thumbnail,
        images: media.images.map((url) => ({ url })),
        // Add dimensions to product attributes (in cm and kg for UI)
        length: lengthCm,
        width: widthCm,
        height: heightCm,
        weight: weightKg,
        // Add product codes and identifiers
        mid_code: (product.mpn && product.mpn.trim()) ||
            (product.model && product.model.trim()) ||
            undefined,
        hs_code: (product.upc && product.upc.trim()) || undefined,
        origin_country: undefined, // Not available in OpenCart base schema
        material: undefined, // Not available in OpenCart base schema
        variants: [
            {
                title: "Default",
                sku: baseSku,
                prices: [
                    {
                        currency_code: config_1.config.medusa.defaultCurrency,
                        amount: 0, // placeholder; will be overwritten below
                    },
                ],
            },
        ],
        metadata,
    };
    ensureOptionsForVariants(payload, product.name);
    const { amount, regularAmount, discountPercent } = resolveFinalPriceRupees(product.price, isSpecialActive({
        price: product.special_price,
        date_start: product.special_price_start,
        date_end: product.special_price_end,
    })
        ? product.special_price
        : undefined);
    // Log price conversion for debugging
    await logger_1.logger.info({
        jobId: context.jobId,
        step: "migrate",
        message: `Price conversion for product ${product.product_id}`,
        productId: product.product_id,
        ocPriceRupees: product.price,
        ocSpecialPriceRupees: product.special_price,
        currency: config_1.config.medusa.defaultCurrency,
        amountRupees: amount,
        regularRupees: regularAmount,
        discountPercent,
        // Price is now stored as whole rupees (decimal_digits=0)
        expectedDisplayPrice: `₹${amount.toLocaleString("en-IN")}`,
        expectedDisplayPriceRegular: `₹${regularAmount.toLocaleString("en-IN")}`,
    });
    payload.variants =
        payload.variants?.map((variant) => ({
            ...variant,
            prices: [
                {
                    currency_code: config_1.config.medusa.defaultCurrency,
                    amount,
                },
            ],
        })) ?? payload.variants;
    payload.metadata = {
        ...payload.metadata,
        oc_currency: config_1.config.medusa.defaultCurrency,
        oc_regular_price_rupees: regularAmount,
        oc_sale_price_rupees: amount,
        oc_discount_percent: discountPercent,
    };
    if (brand) {
        try {
            payload.collection_id = await upsertCollection(context, brand);
        }
        catch (error) {
            await logger_1.logger.warn({
                jobId: context.jobId,
                step: "migrate",
                message: `Failed to upsert collection for brand "${brand}"`,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    const medusaCategoryIds = [];
    let fallbackLeafName = null;
    for (const path of allPaths) {
        let parentMedusaId;
        for (const node of path) {
            const nodeHandle = slugify(node.name);
            if (!nodeHandle) {
                continue;
            }
            try {
                const medusaId = await upsertCategory(context, node.name, nodeHandle, parentMedusaId);
                parentMedusaId = medusaId;
                medusaCategoryIds.push(medusaId);
            }
            catch (error) {
                await logger_1.logger.warn({
                    jobId: context.jobId,
                    step: "migrate",
                    message: `Failed to upsert category "${node.name}"`,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    if (!medusaCategoryIds.length) {
        const title = product.name ?? "";
        for (const rule of KEYWORD_CATEGORY_FALLBACK) {
            if (rule.rx.test(title)) {
                try {
                    const ids = await ensureCategoryTrail(context, rule.trail);
                    medusaCategoryIds.push(...ids);
                    fallbackLeafName = rule.trail[rule.trail.length - 1] ?? null;
                }
                catch (error) {
                    await logger_1.logger.warn({
                        jobId: context.jobId,
                        step: "migrate",
                        message: "Failed to apply fallback category trail",
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                break;
            }
        }
    }
    if (medusaCategoryIds.length) {
        payload.categories = Array.from(new Set(medusaCategoryIds)).map((id) => ({
            id,
        }));
    }
    const metadataTags = Array.isArray(metadata.oc_tags)
        ? metadata.oc_tags
        : typeof metadata.oc_tags === "string"
            ? [metadata.oc_tags]
            : [];
    const extraTags = [];
    if (/\bpressure\s*cooker\b/i.test(product.name || "")) {
        extraTags.push("Pressure Cooker");
    }
    if (/\bcooker\b/i.test(product.name || "")) {
        extraTags.push("Cooker");
    }
    const rawTags = uniq([...srcTagsArray, ...metadataTags, ...extraTags]);
    metadata.oc_tags = rawTags;
    let tagIds = [];
    if (!context.dryRun && rawTags.length) {
        tagIds = await ensureTagRefs(context, rawTags);
    }
    payload.tags = tagIds.length ? tagIds : undefined;
    payload.categories = payload.categories ?? [];
    payload.images = payload.images ?? [];
    if (context.salesChannelId) {
        payload.sales_channels = [{ id: context.salesChannelId }];
    }
    if (!payload.thumbnail && media.images?.length) {
        payload.thumbnail = media.images[0];
    }
    if (!payload.variants || !payload.variants.length) {
        payload.variants = [
            {
                title: "Default",
                sku: baseSku,
                prices: [
                    {
                        currency_code: config_1.config.medusa.defaultCurrency,
                        amount: 0,
                    },
                ],
            },
        ];
    }
    ensureOptionsForVariants(payload, product.name);
    const finalLeafName = allPaths[0]?.[allPaths[0].length - 1]?.name || fallbackLeafName;
    if (finalLeafName) {
        try {
            payload.type_id = await upsertType(context, finalLeafName);
        }
        catch (error) {
            await logger_1.logger.warn({
                jobId: context.jobId,
                step: "migrate",
                message: `Failed to upsert type "${finalLeafName}"`,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    // Set product status (published unless dry-run)
    payload.status = productStatus;
    if (context.dryRun) {
        await logger_1.logger.info({
            jobId: context.jobId,
            step: "migrate",
            message: `Dry-run: would create Medusa product ${product.product_id}`,
        });
        return;
    }
    assertProductPayload(payload);
    if (RESEED_ENABLED) {
        await deleteIfExistsByHandle(admin, handle);
    }
    try {
        const response = await admin.post("/admin/products", payload);
        const created = response.data?.product ??
            (response.data && response.data.id ? response.data : null);
        if (!created) {
            throw new Error("Medusa response missing product payload");
        }
        await logger_1.logger.info({
            jobId: context.jobId,
            step: "migrate",
            message: `Created product ${product.product_id} with status: ${created.status || payload.status}`,
            productId: product.product_id,
            medusaProductId: created.id,
            status: created.status || payload.status,
        });
        // If product was created as draft but should be published, update it
        if (created.status === "draft" && productStatus === "published") {
            try {
                await admin.post(`/admin/products/${created.id}`, {
                    status: "published",
                });
                await logger_1.logger.info({
                    jobId: context.jobId,
                    step: "migrate",
                    message: `Updated product ${product.product_id} status to published`,
                    productId: product.product_id,
                    medusaProductId: created.id,
                });
            }
            catch (error) {
                await logger_1.logger.warn({
                    jobId: context.jobId,
                    step: "migrate",
                    message: `Failed to update product ${product.product_id} status to published`,
                    productId: product.product_id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        if (!Array.isArray(created.variants)) {
            return;
        }
        if (!context.defaultLocationId) {
            context.defaultLocationId = await ensureDefaultLocation(admin);
        }
        const locationId = context.defaultLocationId;
        for (const variant of created.variants) {
            if (!variant?.id) {
                continue;
            }
            const variantSku = (variant.sku ?? baseSku).trim();
            const src = sourceVariantsBySku.get(variantSku.toLowerCase()) ?? {
                qty: Number(product.quantity ?? 0),
                length: product.length,
                width: product.width,
                height: product.height,
                lengthUnit: product.length_class_title,
                weight: product.weight,
                weightUnit: product.weight_class_title,
            };
            const inventoryItemId = await createInventoryItemForVariant(admin, variant.id, variantSku || `${handle}-${variant.id}`, {
                oc_product_id: product.product_id,
                oc_variant_sku: variantSku,
                oc_variant_id: variant.id,
            });
            if (locationId) {
                const quantityRaw = Number.isFinite(src.qty)
                    ? Number(src.qty)
                    : Number(product.quantity ?? 0);
                const quantity = Number.isFinite(quantityRaw)
                    ? Math.max(0, Math.trunc(quantityRaw))
                    : 0;
                // Always set location level, even if quantity is 0, so location is linked
                try {
                    await setLocationLevel(admin, inventoryItemId, locationId, quantity);
                    await logger_1.logger.info({
                        jobId: context.jobId,
                        step: "migrate",
                        message: `✅ Set inventory quantity: ${quantity} for product ${product.product_id}, variant ${variant.id} at location ${locationId}`,
                        productId: product.product_id,
                        variantId: variant.id,
                        quantity,
                        locationId,
                        inventoryItemId,
                    });
                }
                catch (error) {
                    await logger_1.logger.error({
                        jobId: context.jobId,
                        step: "migrate",
                        message: `❌ Failed to set inventory quantity for product ${product.product_id}`,
                        productId: product.product_id,
                        variantId: variant.id,
                        quantity,
                        locationId,
                        inventoryItemId,
                        error: error instanceof Error ? error.message : String(error),
                        errorStack: error instanceof Error ? error.stack : undefined,
                    });
                }
            }
            else {
                await logger_1.logger.error({
                    jobId: context.jobId,
                    step: "migrate",
                    message: `No location ID available for product ${product.product_id}, variant ${variant.id}`,
                    productId: product.product_id,
                    variantId: variant.id,
                });
            }
            const dimensionsPayload = {};
            const lengthMm = toMm(src.length ?? product.length, src.lengthUnit ?? product.length_class_title);
            const widthMm = toMm(src.width ?? product.width, src.lengthUnit ?? product.length_class_title);
            const heightMm = toMm(src.height ?? product.height, src.lengthUnit ?? product.length_class_title);
            const weightGrams = toGrams(src.weight ?? product.weight, src.weightUnit ?? product.weight_class_title);
            if (typeof lengthMm === "number") {
                dimensionsPayload.length = lengthMm;
            }
            if (typeof widthMm === "number") {
                dimensionsPayload.width = widthMm;
            }
            if (typeof heightMm === "number") {
                dimensionsPayload.height = heightMm;
            }
            if (typeof weightGrams === "number") {
                dimensionsPayload.weight = weightGrams;
            }
            await updateInventoryDimensions(admin, inventoryItemId, dimensionsPayload);
            // Also update product metadata with dimensions if they exist
            if (Object.keys(dimensionsPayload).length > 0) {
                try {
                    await admin.post(`/admin/products/${created.id}`, {
                        metadata: {
                            ...payload.metadata,
                            variant_dimensions: {
                                [variant.id]: dimensionsPayload,
                            },
                        },
                    });
                }
                catch (error) {
                    await logger_1.logger.warn({
                        jobId: context.jobId,
                        step: "migrate",
                        message: `Failed to update product metadata with dimensions for variant ${variant.id}`,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }
        if (typeof context.salesChannelId === "undefined" ||
            context.salesChannelId === null) {
            context.salesChannelId = await getDefaultSalesChannelId(admin);
        }
        if ((!payload.sales_channels || !payload.sales_channels.length) &&
            context.salesChannelId) {
            await addProductToSalesChannel(admin, created.id, context.salesChannelId);
        }
    }
    catch (error) {
        let message = "Unknown Medusa error";
        let status;
        let responseData;
        if ((0, axios_1.isAxiosError)(error)) {
            message = error.message;
            status = error.response?.status;
            responseData = error.response?.data;
        }
        else if (error instanceof Error) {
            message = error.message;
        }
        await logger_1.logger.error({
            jobId: context.jobId,
            step: "migrate",
            message: `Failed to create Medusa product ${product.product_id}`,
            error: message,
            status: status ?? "unknown",
            response: responseData ?? null,
            payload,
        });
        throw new Error(`Medusa product create failed (product_id=${product.product_id}, status=${status ?? "n/a"}): ${message}`);
    }
}
function assertProductPayload(payload) {
    if (!Array.isArray(payload.options)) {
        throw new Error("options must be an array");
    }
    const firstOption = payload.options[0];
    if (!firstOption || !Array.isArray(firstOption.values)) {
        throw new Error("options[0].values must be an array");
    }
    if (firstOption.values.some((value) => typeof value !== "string" || !value.trim())) {
        throw new Error("options[0].values[] must be strings");
    }
    if (payload.variants?.some((variant) => !variant.options || Array.isArray(variant.options))) {
        throw new Error("variant.options must be an object (map)");
    }
}
async function upsertStagingRow(context, product, media) {
    if (!context.postgresPool) {
        return;
    }
    const client = await context.postgresPool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`
        CREATE TABLE IF NOT EXISTS staging_opencart_products (
          source_name TEXT NOT NULL,
          source_id INTEGER NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (source_name, source_id)
        )
      `);
        await client.query(`
        INSERT INTO staging_opencart_products (source_name, source_id, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (source_name, source_id)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `, [
            "opencart",
            product.product_id,
            {
                product,
                media,
                mapping: context.mapping,
            },
        ]);
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
async function processProduct(context, product) {
    const galleryImages = await fetchProductImages(product.product_id);
    const candidates = await buildProductImages(context, product.product_id, [
        product.image ?? "",
        ...galleryImages,
    ]);
    // Update image pipeline context for structured S3 keys
    context.imagePipeline.setProductContext({
        brandName: product.manufacturer_name,
        productName: product.name,
        productId: product.product_id,
    });
    const pipelineResults = [];
    for (const [index, imageUrl] of candidates.images.entries()) {
        const result = await context.imagePipeline.processImage("oc_product_image", `${product.product_id}_${index}`, imageUrl);
        pipelineResults[index] = result;
        if (result.status === "uploaded" || result.status === "skipped") {
            if (result.status === "uploaded") {
                context.checkpoint.imagesUploaded += 1;
            }
            if (result.status === "skipped" &&
                result.error?.includes("OBJECT_STORAGE_BUCKET not configured")) {
                await logger_1.logger.warn({
                    jobId: context.jobId,
                    step: "image",
                    message: "Image retained locally because OBJECT_STORAGE_BUCKET is not configured. Falling back to source URL.",
                    productId: product.product_id,
                    imageUrl,
                });
            }
        }
        if (result.status === "failed") {
            context.checkpoint.imagesFailed += 1;
            await (0, job_manager_1.addJobError)(context.jobId, `Image failure for product ${product.product_id}: ${result.error}`);
        }
    }
    const medusaImageSet = new Set();
    const medusaImages = [];
    for (let index = 0; index < candidates.images.length; index += 1) {
        const candidateUrl = candidates.images[index];
        const processed = pipelineResults[index];
        const preferredUrl = processed?.objectUrl && /^https?:\/\//i.test(processed.objectUrl)
            ? processed.objectUrl
            : candidateUrl;
        // Ensure URL is absolute and valid
        const finalUrl = preferredUrl && preferredUrl.startsWith("http")
            ? preferredUrl
            : candidateUrl && candidateUrl.startsWith("http")
                ? candidateUrl
                : null;
        if (finalUrl && !medusaImageSet.has(finalUrl)) {
            medusaImageSet.add(finalUrl);
            medusaImages.push(finalUrl);
        }
        if (medusaImages.length >= MAX_PRODUCT_IMAGES) {
            break;
        }
    }
    if (!medusaImages.length) {
        medusaImages.push((0, image_resolver_1.placeholderUrl)());
    }
    const media = {
        thumbnail: medusaImages[0],
        images: medusaImages,
        resolved: candidates.resolved,
    };
    await upsertStagingRow(context, product, media);
    await createMedusaProduct(context, product, media);
}
async function fetchSampleProducts(limit) {
    const sql = `
    SELECT
      p.product_id,
      pd.name,
      p.image
    FROM ${config_1.config.mysql.tablePrefix}product p
    INNER JOIN ${config_1.config.mysql.tablePrefix}product_description pd
      ON pd.product_id = p.product_id
      AND pd.language_id = ?
    ORDER BY p.date_modified DESC
    LIMIT ?
  `;
    return (0, mysql_client_1.runQuery)(sql, [config_1.config.mysql.languageId, limit]);
}
async function generateVerificationReport(context) {
    const reportDir = path_1.default.join(config_1.config.paths.reportsDir, context.jobId);
    await (0, utils_1.ensureDir)(reportDir);
    const reportPath = path_1.default.join(reportDir, "verification.json");
    const sample = await fetchSampleProducts(DEFAULT_SAMPLE_SIZE);
    const report = {
        summary: context.checkpoint,
        samples: sample,
        generatedAt: new Date().toISOString(),
    };
    await (0, utils_1.writeJson)(reportPath, report);
    await (0, job_manager_1.attachArtifact)(context.jobId, "verification", reportPath);
    return reportPath;
}
async function writeMigrationReport(context) {
    const reportDir = path_1.default.join(config_1.config.paths.reportsDir, context.jobId);
    await (0, utils_1.ensureDir)(reportDir);
    const job = await (0, job_manager_1.getJob)(context.jobId);
    const report = {
        jobId: context.jobId,
        generatedAt: new Date().toISOString(),
        summary: {
            processed: context.checkpoint.processed,
            succeeded: context.checkpoint.succeeded,
            failed: context.checkpoint.failed,
            imagesUploaded: context.checkpoint.imagesUploaded,
            imagesFailed: context.checkpoint.imagesFailed,
        },
        errors: job?.errors ?? [],
        artifacts: job?.artifacts ?? {},
    };
    const reportPath = path_1.default.join(reportDir, "report.json");
    await (0, utils_1.writeJson)(reportPath, report);
    await (0, job_manager_1.attachArtifact)(context.jobId, "report", reportPath);
    return reportPath;
}
async function runMigration(jobId, params) {
    let mappingPath = params.mappingPath ?? process.env.OPENCART_ETL_MAPPING;
    if (!mappingPath && params.mappingJobId) {
        const mappingJob = await (0, job_manager_1.getJob)(params.mappingJobId);
        mappingPath = mappingJob?.artifacts?.mapping;
        if (!mappingPath) {
            throw new Error(`Mapping artifact not found for job ${params.mappingJobId}. Run /discover first.`);
        }
    }
    const mapping = await loadMapping(mappingPath);
    const checkpointDir = path_1.default.join(config_1.config.paths.checkpointsDir, jobId);
    await (0, utils_1.ensureDir)(checkpointDir);
    const checkpointPath = path_1.default.join(checkpointDir, "checkpoint.json");
    const dryRun = params.dryRun ?? config_1.config.medusa.dryRun ?? false;
    const maxProducts = params.maxProducts;
    // If maxProducts is set and smaller than default batch size, use it as batch size
    const defaultBatchSize = config_1.config.worker.batchSize;
    const batchSize = params.batchSize ??
        (maxProducts && maxProducts < defaultBatchSize
            ? maxProducts
            : defaultBatchSize);
    const context = {
        jobId,
        mapping,
        dryRun,
        batchSize,
        checkpointPath,
        checkpoint: params.resumeFromCheckpoint
            ? await loadCheckpoint(checkpointPath)
            : {
                processed: 0,
                succeeded: 0,
                failed: 0,
                imagesUploaded: 0,
                imagesFailed: 0,
            },
        medusaClient: createMedusaClient(),
        postgresPool: await initPostgresPool(),
        imagePipeline: new image_pipeline_1.ImagePipeline(jobId, {
            brandName: undefined,
            productName: undefined,
            productId: undefined,
        }),
        defaultLocationId: undefined,
        salesChannelId: config_1.config.medusa.defaultSalesChannelId ?? undefined,
        collectionCache: new Map(),
        typeCache: new Map(),
        categoryCache: new Map(),
        tagCache: new Map(),
    };
    await (0, job_manager_1.attachArtifact)(jobId, "checkpoint", checkpointPath);
    if (context.medusaClient) {
        try {
            const locationId = await ensureDefaultLocation(context.medusaClient);
            context.defaultLocationId = locationId;
            console.log("[etl] stock location:", locationId);
        }
        catch (error) {
            await logger_1.logger.error({
                jobId,
                step: "migrate",
                message: "Failed to resolve default stock location",
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        if (typeof context.salesChannelId === "undefined" ||
            context.salesChannelId === null) {
            context.salesChannelId = await getDefaultSalesChannelId(context.medusaClient);
        }
    }
    try {
        let processedThisRun = 0;
        let lastId = context.checkpoint.lastProductId;
        let hasMore = true;
        while (hasMore) {
            const batch = await fetchProductsBatch(lastId, batchSize);
            if (!batch.length) {
                hasMore = false;
                break;
            }
            for (const product of batch) {
                try {
                    await processProduct(context, product);
                    context.checkpoint.succeeded += 1;
                    await logger_1.logger.info({
                        jobId,
                        step: "migrate",
                        message: `Migrated product ${product.product_id}`,
                    });
                }
                catch (error) {
                    context.checkpoint.failed += 1;
                    await (0, job_manager_1.addJobError)(jobId, `Failed to migrate product ${product.product_id}`, error);
                }
                finally {
                    context.checkpoint.processed += 1;
                    context.checkpoint.lastProductId = product.product_id;
                    await persistCheckpoint(context.checkpointPath, context.checkpoint);
                    processedThisRun += 1;
                    await (0, job_manager_1.updateJobProgress)(jobId, {
                        total: undefined,
                        processed: context.checkpoint.processed,
                        succeeded: context.checkpoint.succeeded,
                        failed: context.checkpoint.failed,
                        stage: "migrate",
                        message: `Processed product ${product.product_id}`,
                    });
                    if (typeof maxProducts === "number" &&
                        maxProducts > 0 &&
                        processedThisRun >= maxProducts) {
                        hasMore = false;
                        break;
                    }
                }
            }
            lastId = batch[batch.length - 1]?.product_id;
        }
        const reportPath = await generateVerificationReport(context);
        await (0, job_manager_1.attachArtifact)(jobId, "verification_report", reportPath);
        const summaryMessage = `Migration summary processed=${context.checkpoint.processed} succeeded=${context.checkpoint.succeeded} failed=${context.checkpoint.failed}`;
        await logger_1.logger.info({
            jobId,
            step: "migrate",
            message: summaryMessage,
            summary: {
                processed: context.checkpoint.processed,
                succeeded: context.checkpoint.succeeded,
                failed: context.checkpoint.failed,
                imagesUploaded: context.checkpoint.imagesUploaded,
                imagesFailed: context.checkpoint.imagesFailed,
            },
        });
        const finalReportPath = await writeMigrationReport(context);
        await logger_1.logger.info({
            jobId,
            step: "migrate",
            message: "Migration report written",
            reportPath: finalReportPath,
        });
        await (0, job_manager_1.updateJobProgress)(jobId, {
            processed: context.checkpoint.processed,
            succeeded: context.checkpoint.succeeded,
            failed: context.checkpoint.failed,
            stage: "migrate",
            message: summaryMessage,
        });
    }
    finally {
        if (context.postgresPool) {
            await context.postgresPool.end();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlncmF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9taWdyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEraEJBLDREQXFDQztBQSsyQ0Qsb0NBcUxDO0FBeG1FRCxnREFBd0I7QUFDeEIsK0NBQTJEO0FBQzNELDJCQUEwQjtBQUUxQixxQ0FBNEQ7QUFDNUQsK0NBS3VCO0FBQ3ZCLHFDQUFrQztBQUNsQyxpREFBMEM7QUFDMUMscURBQWlEO0FBRWpELG1DQUF5RDtBQUN6RCxxREFJMEI7QUFDMUIsaURBQTJDO0FBRTNDLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBQ2hDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO0FBQzdCLE1BQU0sY0FBYyxHQUNsQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUU3RCxNQUFNLHdCQUF3QixHQUFHLEdBQVcsRUFBRTtJQUM1QyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsZUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM3RCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksUUFBUSxDQUFDLENBQUM7SUFDM0QsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMxQyxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBQ0QsT0FBTyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFJRixTQUFTLHdCQUF3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