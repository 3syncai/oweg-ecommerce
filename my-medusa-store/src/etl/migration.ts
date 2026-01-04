import path from "path";
import axios, { AxiosInstance, isAxiosError } from "axios";
import { Pool } from "pg";
import { RowDataPacket } from "mysql2/promise";
import { config, MEDUSA_URL, adminHeaders } from "./config";
import {
  attachArtifact,
  updateJobProgress,
  addJobError,
  getJob,
} from "./job-manager";
import { logger } from "./logger";
import { runQuery } from "./mysql-client";
import { ImagePipeline } from "./image-pipeline";
import type { ProcessResult } from "./image-pipeline";
import { readJson, writeJson, ensureDir } from "./utils";
import {
  resolveImageUrl,
  ResolveResult,
  placeholderUrl,
} from "./image-resolver";
import { cleanHtml } from "./html-cleaner";

const DEFAULT_SAMPLE_SIZE = 100;
const MAX_PRODUCT_IMAGES = 8;
const RESEED_ENABLED =
  (process.env.RESEED ?? "").trim().toLowerCase() === "true";

const parseResolverConcurrency = (): number => {
  const fallback = Number(config.worker.imageConcurrency ?? 4);
  const parsed = Number(process.env.CONCURRENCY ?? fallback);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback > 0 ? fallback : 4;
};

type AsyncTask<T> = () => Promise<T>;

function createConcurrencyLimiter(limit: number) {
  const max = Math.max(1, limit);
  let activeCount = 0;
  const queue: Array<() => void> = [];

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

  return <T>(task: AsyncTask<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

interface CheckpointState {
  lastProductId?: number;
  processed: number;
  succeeded: number;
  failed: number;
  imagesUploaded: number;
  imagesFailed: number;
}

interface MigrationMapping {
  [key: string]: string;
}

interface MigrationContext {
  jobId: string;
  mapping: MigrationMapping;
  dryRun: boolean;
  batchSize: number;
  checkpointPath: string;
  checkpoint: CheckpointState;
  medusaClient: AxiosInstance | null;
  postgresPool: Pool | null;
  imagePipeline: ImagePipeline;
  defaultLocationId?: string;
  salesChannelId?: string | null;
  collectionCache: Map<string, string>;
  typeCache: Map<string, string>;
  categoryCache: Map<string, string>;
  tagCache: Map<string, string>;
}

interface ResolvedImageDetail extends ResolveResult {
  raw: string;
}

interface ProductMedia {
  thumbnail: string;
  images: string[];
  resolved: ResolvedImageDetail[];
}

interface CategoryPathNode {
  id: number;
  name: string;
  parentId: number | null;
}

type CategoryPath = CategoryPathNode[];

// --- inventory helpers ------------------------------------------------------

async function ensureDefaultLocation(admin: AxiosInstance): Promise<string> {
  const name = "Default";
  try {
    const { data } = await admin.get("/admin/stock-locations", {
      params: { q: name, limit: 1 },
    });
    const existing = data?.stock_locations?.[0];
    if (existing?.id) {
      return existing.id;
    }
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      throw new Error(
        "Inventory module not enabled (stock-locations 404). Ensure you're on Medusa v2 and inventory modules are installed."
      );
    }
    throw error;
  }
  const { data } = await admin.post("/admin/stock-locations", { name });
  return data.stock_location.id;
}

async function deleteIfExistsByHandle(
  admin: AxiosInstance,
  handle: string
): Promise<void> {
  if (!handle) {
    return;
  }
  try {
    const { data } = await admin.get("/admin/products", {
      params: { q: handle, limit: 1 },
    });
    const existing = data?.products?.find((p: any) => p?.handle === handle);
    if (!existing?.id) {
      return;
    }
    await admin.delete(`/admin/products/${existing.id}`);
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return;
    }
    throw error;
  }
}

async function createInventoryItemForVariant(
  admin: AxiosInstance,
  variantId: string,
  sku: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const { data } = await admin.post("/admin/inventory-items", {
    sku,
    metadata,
  });
  const inventoryItemId = data?.inventory_item?.id;
  if (!inventoryItemId) {
    throw new Error(
      `Failed to create inventory item for variant ${variantId} (sku=${sku})`
    );
  }
  await admin.post(`/admin/variants/${variantId}/inventory-items`, {
    inventory_item_id: inventoryItemId,
    required: true,
  });
  return inventoryItemId;
}

async function setLocationLevel(
  admin: AxiosInstance,
  inventoryItemId: string,
  locationId: string,
  quantity: number
): Promise<void> {
  try {
    // Try to create the location level
    await admin.post(
      `/admin/inventory-items/${inventoryItemId}/location-levels`,
      {
        location_id: locationId,
        stocked_quantity: quantity,
      }
    );
  } catch (error: any) {
    // If it already exists, try to update it
    if (error.response?.status === 400 || error.response?.status === 409) {
      await admin.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`,
        {
          stocked_quantity: quantity,
        }
      );
    } else {
      throw error;
    }
  }
}

async function updateInventoryDimensions(
  admin: AxiosInstance,
  inventoryItemId: string,
  dimensions: Partial<{
    length: number;
    width: number;
    height: number;
    weight: number;
  }>
): Promise<void> {
  if (!Object.keys(dimensions).length) {
    return;
  }
  await admin.post(`/admin/inventory-items/${inventoryItemId}`, dimensions);
}

async function getDefaultSalesChannelId(
  admin: AxiosInstance
): Promise<string | null> {
  const { data } = await admin.get("/admin/sales-channels", {
    params: { limit: 1 },
  });
  const id = data?.sales_channels?.[0]?.id;
  return id ?? null;
}

async function addProductToSalesChannel(
  admin: AxiosInstance,
  productId: string,
  salesChannelId: string
): Promise<void> {
  await admin.post(`/admin/products/${productId}/sales-channels/batch`, {
    add: [salesChannelId],
  });
}

async function upsertCollection(
  context: MigrationContext,
  title: string
): Promise<string> {
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

async function upsertType(
  context: MigrationContext,
  value: string
): Promise<string> {
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

async function upsertCategory(
  context: MigrationContext,
  title: string,
  handle: string,
  parentId?: string
): Promise<string> {
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
  const existing = data?.product_categories?.find(
    (c: any) => c?.handle === handle || c?.name === title
  );
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

function toCm(value?: number | null, unit?: string | null): number | undefined {
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
  if (
    normalized.includes("m") &&
    !normalized.includes("mm") &&
    !normalized.includes("cm")
  ) {
    // Convert m to cm
    return Math.round(value * 100 * 10) / 10;
  }
  // Default to cm
  return Math.round(value * 10) / 10;
}

function toKg(value?: number | null, unit?: string | null): number | undefined {
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
function toMm(value?: number | null, unit?: string | null): number | undefined {
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

function toGrams(
  value?: number | null,
  unit?: string | null
): number | undefined {
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

function toRupees(input?: string | number | null): number {
  if (input == null) return 0;
  const raw = String(input).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[₹,\s]/g, "");
  const rupees = Number.parseFloat(cleaned);
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees);
}

function resolveFinalPriceRupees(
  regularRupees: string,
  specialRupees?: string | null
) {
  const regularAmount = toRupees(regularRupees);
  const specialAmount = toRupees(specialRupees ?? "");
  const amount =
    specialAmount > 0 && specialAmount < regularAmount
      ? specialAmount
      : regularAmount;
  const discountPercent =
    amount < regularAmount && regularAmount > 0
      ? Math.round(((regularAmount - amount) / regularAmount) * 100)
      : 0;
  return { amount, regularAmount, discountPercent };
}

function isSpecialActive(special?: {
  price?: string | number | null;
  date_start?: string | null;
  date_end?: string | null;
}): boolean {
  if (!special?.price) {
    return false;
  }
  const now = Date.now();
  const startOk =
    !special.date_start || new Date(special.date_start).getTime() <= now;
  const endOk =
    !special.date_end || new Date(special.date_end).getTime() >= now;
  return startOk && endOk;
}

type CreateProductPayload = {
  title: string;
  handle?: string;
  status?: "draft" | "published";
  description?: string | null;
  thumbnail?: string;
  images?: { url: string }[];
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  mid_code?: string;
  hs_code?: string;
  origin_country?: string;
  material?: string;
  options?: { title: string; values: string[] }[];
  variants?: Array<{
    title?: string;
    sku?: string | null;
    prices: { currency_code: string; amount: number }[];
    options?: Record<string, string>;
  }>;
  metadata?: Record<string, unknown>;
  collection_id?: string;
  type_id?: string;
  categories?: Array<{ id: string }>;
  tags?: Array<{ id: string }>;
  sales_channels?: Array<{ id: string }>;
};

function collectOptionValues(
  variants: Array<{ options?: Record<string, string> }>,
  key: string
): string[] {
  const values = new Set<string>();
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

export function ensureOptionsForVariants(
  payload: CreateProductPayload,
  sourceName: string
): void {
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

function extractCapacity(name: string): string | null {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liters?|litres?)/i);
  return match ? `${match[1]} L` : null;
}

function normalizeCapacity(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/l(it(er|re))?s?$/i, "L");
}

async function loadMapping(mappingPath?: string): Promise<MigrationMapping> {
  if (!mappingPath) {
    throw new Error(
      "Mapping path not provided. Generate mapping via /discover or supply OPENCART_ETL_MAPPING."
    );
  }
  const data = await readJson<MigrationMapping>(mappingPath);
  if (!data) {
    throw new Error(`Mapping file missing or invalid: ${mappingPath}`);
  }
  return data;
}

function createMedusaClient(): AxiosInstance {
  const configured = (config.medusa.adminUrl || MEDUSA_URL).trim();
  const baseHost = configured.replace(/\/admin\/?$/i, "");
  const base = baseHost.replace(/\/$/, "");
  return axios.create({
    baseURL: base,
    headers: adminHeaders(),
    timeout: 30000,
  });
}

async function initPostgresPool(): Promise<Pool | null> {
  if (!config.postgres.uri) {
    return null;
  }
  return new Pool({
    connectionString: config.postgres.uri,
    ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
  });
}

async function loadCheckpoint(
  checkpointPath: string
): Promise<CheckpointState> {
  const data = await readJson<CheckpointState>(checkpointPath);
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

async function persistCheckpoint(
  checkpointPath: string,
  state: CheckpointState
): Promise<void> {
  await writeJson(checkpointPath, state);
}

interface ProductRow extends RowDataPacket {
  product_id: number;
  name: string;
  model: string | null;
  sku: string | null;
  upc: string | null;
  ean: string | null;
  jan: string | null;
  isbn: string | null;
  mpn: string | null;
  quantity: number | null;
  price: string;
  special_price: string | null;
  special_price_start?: string | null;
  special_price_end?: string | null;
  description: string | null;
  image: string | null;
  manufacturer_id: number | null;
  manufacturer_name: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  length_class_id: number | null;
  length_class_title: string | null;
  weight: number | null;
  weight_class_id: number | null;
  weight_class_title: string | null;
}

async function fetchProductsBatch(
  lastId: number | undefined,
  limit: number
): Promise<ProductRow[]> {
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
    FROM ${config.mysql.tablePrefix}product p
    INNER JOIN ${config.mysql.tablePrefix}product_description pd
      ON pd.product_id = p.product_id
      AND pd.language_id = ?
    LEFT JOIN ${config.mysql.tablePrefix}product_special ps
      ON ps.product_id = p.product_id
      AND (ps.date_start IS NULL OR ps.date_start <= CURDATE())
      AND (ps.date_end IS NULL OR ps.date_end >= CURDATE())
    LEFT JOIN ${config.mysql.tablePrefix}manufacturer m
      ON m.manufacturer_id = p.manufacturer_id
    LEFT JOIN ${config.mysql.tablePrefix}length_class_description lcd
      ON lcd.length_class_id = p.length_class_id
      AND lcd.language_id = ?
    LEFT JOIN ${config.mysql.tablePrefix}weight_class_description wcd
      ON wcd.weight_class_id = p.weight_class_id
      AND wcd.language_id = ?
    ${whereClause}
    ORDER BY p.product_id
    LIMIT ?
  `;
  if (lastId) {
    return runQuery<ProductRow[]>(sql, [
      config.mysql.languageId,
      config.mysql.languageId,
      config.mysql.languageId,
      lastId,
      limit,
    ]);
  }
  return runQuery<ProductRow[]>(sql, [
    config.mysql.languageId,
    config.mysql.languageId,
    config.mysql.languageId,
    limit,
  ]);
}

interface ProductImageRow extends RowDataPacket {
  image: string;
}

async function fetchProductImages(productId: number): Promise<string[]> {
  const sql = `
    SELECT image
    FROM ${config.mysql.tablePrefix}product_image
    WHERE product_id = ?
    ORDER BY sort_order ASC
  `;
  const rows = await runQuery<ProductImageRow[]>(sql, [productId]);
  return rows.map((row) => row.image).filter(Boolean);
}

interface ProductCategoryRow extends RowDataPacket {
  category_id: number;
  main_category?: number | null;
}

interface CategoryRow extends RowDataPacket {
  category_id: number;
}

interface CategoryPathRow extends RowDataPacket {
  category_id: number;
  parent_id: number | null;
  name: string;
  level: number;
}

// Tries multiple OpenCart variants; returns string[]
async function fetchProductTags(
  _conn: any,
  productId: number
): Promise<string[]> {
  const productTagTable = `${config.mysql.tablePrefix}product_tag`;
  const productDescriptionTable = `${config.mysql.tablePrefix}product_description`;
  const productToTagTable = `${config.mysql.tablePrefix}product_to_tag`;

  try {
    const primaryRows = await runQuery<RowDataPacket[]>(
      `SELECT tag FROM ${productTagTable} WHERE product_id = ?`,
      [productId]
    );
    if (Array.isArray(primaryRows) && primaryRows.length) {
      return primaryRows
        .map((row) => (row?.tag ?? "").toString().trim())
        .filter(Boolean);
    }
  } catch (error: any) {
    const code = error?.code ?? error?.errno;
    const message = String(error?.message ?? "");
    const isMissingTable =
      code === "ER_NO_SUCH_TABLE" ||
      message.includes("doesn't exist") ||
      message.includes("does not exist");
    if (!isMissingTable) {
      throw error;
    }
  }

  try {
    const fallbackRows = await runQuery<RowDataPacket[]>(
      `SELECT tag FROM ${productDescriptionTable} WHERE product_id = ?`,
      [productId]
    );
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
  } catch {
    // ignore fallback errors
  }

  try {
    const altRows = await runQuery<RowDataPacket[]>(
      `SELECT tag FROM ${productToTagTable} WHERE product_id = ?`,
      [productId]
    );
    if (Array.isArray(altRows) && altRows.length) {
      return altRows
        .map((row) => (row?.tag ?? "").toString().trim())
        .filter(Boolean);
    }
  } catch {
    // ignore
  }

  return [];
}

async function ensureTagRefs(
  context: MigrationContext,
  tagValues: string[]
): Promise<Array<{ id: string }>> {
  const admin = context.medusaClient;
  if (!admin) {
    return [];
  }

  const cleaned = uniq(
    (tagValues || [])
      .map((value) => (value ?? "").toString().trim())
      .filter(Boolean)
  );

  const resolved: Array<{ id: string }> = [];

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
      const existing = (search.data?.product_tags ?? []).find(
        (tag: any) =>
          typeof tag?.value === "string" &&
          tag.value.toLowerCase() === key &&
          tag?.id
      );
      if (existing?.id) {
        context.tagCache.set(key, existing.id);
        resolved.push({ id: existing.id });
        continue;
      }
    } catch (error) {
      await logger.warn({
        jobId: context.jobId,
        step: "migrate",
        message: `Failed to search tag "${value}"`,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const created = await admin.post("/admin/product-tags", { value });
      const newTag =
        created.data?.product_tag ??
        (Array.isArray(created.data?.product_tags)
          ? created.data.product_tags[0]
          : undefined);
      if (!newTag?.id) {
        throw new Error("Medusa tag create response missing id");
      }
      context.tagCache.set(key, newTag.id);
      resolved.push({ id: newTag.id });
    } catch (error) {
      await logger.warn({
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
async function fetchPrimaryCategoryId(
  productId: number
): Promise<number | null> {
  const productToCategoryTable = `${config.mysql.tablePrefix}product_to_category`;
  const categoryTable = `${config.mysql.tablePrefix}category`;
  const categoryPathTable = `${config.mysql.tablePrefix}category_path`;

  const hasMainColumn = await runQuery<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'main_category'
    `,
    [productToCategoryTable]
  );

  if ((hasMainColumn?.[0]?.cnt ?? 0) > 0) {
    const rows = await runQuery<ProductCategoryRow[]>(
      `
        SELECT ptc.category_id
        FROM ${productToCategoryTable} ptc
        WHERE ptc.product_id = ?
        ORDER BY ptc.main_category DESC, ptc.category_id ASC
        LIMIT 1
      `,
      [productId]
    );
    return rows?.[0]?.category_id ?? null;
  }

  const rows = await runQuery<ProductCategoryRow[]>(
    `
      SELECT ptc.category_id
      FROM ${productToCategoryTable} ptc
      LEFT JOIN ${categoryPathTable} cp ON cp.category_id = ptc.category_id
      LEFT JOIN ${categoryTable} c ON c.category_id = ptc.category_id
      WHERE ptc.product_id = ?
      GROUP BY ptc.category_id, c.sort_order
      ORDER BY MIN(cp.level) ASC, c.sort_order ASC, ptc.category_id ASC
      LIMIT 1
    `,
    [productId]
  );
  return rows?.[0]?.category_id ?? null;
}

async function fetchCategoryPath(
  categoryId: number
): Promise<CategoryPath | null> {
  const sql = `
    SELECT
      cp.level,
      c.category_id,
      c.parent_id,
      cd.name
    FROM ${config.mysql.tablePrefix}category_path cp
    INNER JOIN ${config.mysql.tablePrefix}category c
      ON c.category_id = cp.path_id
    INNER JOIN ${config.mysql.tablePrefix}category_description cd
      ON cd.category_id = cp.path_id
      AND cd.language_id = ?
    WHERE cp.category_id = ?
    ORDER BY cp.level ASC
  `;
  const rows = await runQuery<CategoryPathRow[]>(sql, [
    config.mysql.languageId,
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

async function fetchAllCategoryIds(productId: number): Promise<number[]> {
  const sql = `
    SELECT category_id
    FROM ${config.mysql.tablePrefix}product_to_category
    WHERE product_id = ?
  `;
  const rows = await runQuery<CategoryRow[]>(sql, [productId]);
  return (rows ?? []).map((row) => row.category_id).filter(Boolean);
}

async function fetchAllCategoryPaths(
  categoryIds: number[]
): Promise<CategoryPath[]> {
  const paths: CategoryPath[] = [];
  for (const id of categoryIds) {
    const path = await fetchCategoryPath(id);
    if (path && path.length) {
      paths.push(path);
    }
  }
  return paths;
}

const KEYWORD_CATEGORY_FALLBACK: Array<{ rx: RegExp; trail: string[] }> = [
  {
    rx: /\bpressure\s*cooker\b/i,
    trail: ["Kitchen Appliances", "Pressure Cookers"],
  },
  {
    rx: /\bcooker\b/i,
    trail: ["Kitchen Appliances", "Pressure Cookers"],
  },
];

async function ensureCategoryTrail(
  context: MigrationContext,
  names: string[]
): Promise<string[]> {
  const ids: string[] = [];
  let parent: string | undefined;
  for (const name of names) {
    const handle = slugify(name);
    const id = await upsertCategory(context, name, handle, parent);
    ids.push(id);
    parent = id;
  }
  return ids;
}

async function buildProductImages(
  context: MigrationContext,
  productId: number,
  rawImages: string[]
): Promise<ProductMedia> {
  const filtered = rawImages
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value));

  if (!filtered.length) {
    const fallback = placeholderUrl();
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

  const tasks = filtered.map((raw) =>
    resolveLimit(async () => {
      const result = await resolveImageUrl(raw);
      return { raw, ...result } as ResolvedImageDetail;
    })
  );

  const seen = new Set<string>();
  const ordered: string[] = [];
  const resolved: ResolvedImageDetail[] = [];

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
    const fallback = placeholderUrl();
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
    await logger.warn({
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

async function createMedusaProduct(
  context: MigrationContext,
  product: ProductRow,
  media: ProductMedia
): Promise<void> {
  if (!context.medusaClient) {
    return;
  }

  const admin = context.medusaClient;
  const baseHandle = slugify(product.name) || "product";
  const handle = `${baseHandle}-${product.product_id}`;
  const baseSku =
    (product.sku ?? product.model ?? `oc-${product.product_id}`)?.trim() ||
    `oc-${product.product_id}`;
  const brand = product.manufacturer_name?.trim() || null;
  const primaryCategoryId = await fetchPrimaryCategoryId(product.product_id);
  const categoryPath = primaryCategoryId
    ? await fetchCategoryPath(primaryCategoryId)
    : null;
  const srcTagsArray = await fetchProductTags(null, product.product_id);
  const isDraft = Boolean(context.dryRun || config.medusa.dryRun);
  const productStatus: "draft" | "published" = isDraft ? "draft" : "published";

  const sourceVariantsBySku = new Map<
    string,
    {
      qty: number;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      lengthUnit?: string | null;
      weight?: number | null;
      weightUnit?: string | null;
    }
  >();
  sourceVariantsBySku.set(baseSku.toLowerCase(), {
    qty: Number(product.quantity ?? 0),
    length: product.length,
    width: product.width,
    height: product.height,
    lengthUnit: product.length_class_title,
    weight: product.weight,
    weightUnit: product.weight_class_title,
  });

  const metadata: Record<string, unknown> = {
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
    metadata.oc_category_path = allPaths.map((path) =>
      path.map((node) => node.name)
    );
  }
  if (srcTagsArray.length) {
    metadata.oc_tags = srcTagsArray;
  }

  // Convert dimensions for product attributes (cm and kg for UI display)
  const lengthCm =
    product.length != null && product.length > 0
      ? toCm(product.length, product.length_class_title)
      : undefined;
  const widthCm =
    product.width != null && product.width > 0
      ? toCm(product.width, product.length_class_title)
      : undefined;
  const heightCm =
    product.height != null && product.height > 0
      ? toCm(product.height, product.length_class_title)
      : undefined;
  const weightKg =
    product.weight != null && product.weight > 0
      ? toKg(product.weight, product.weight_class_title)
      : undefined;

  const payload: CreateProductPayload = {
    title: product.name,
    handle,
    description: cleanHtml(product.description || ""),
    status: productStatus,
    thumbnail: media.thumbnail,
    images: media.images.map((url) => ({ url })),
    // Add dimensions to product attributes (in cm and kg for UI)
    length: lengthCm,
    width: widthCm,
    height: heightCm,
    weight: weightKg,
    // Add product codes and identifiers
    mid_code:
      (product.mpn && product.mpn.trim()) ||
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
            currency_code: config.medusa.defaultCurrency,
            amount: 0, // placeholder; will be overwritten below
          },
        ],
      },
    ],
    metadata,
  };

  ensureOptionsForVariants(payload, product.name);

  const { amount, regularAmount, discountPercent } = resolveFinalPriceRupees(
    product.price,
    isSpecialActive({
      price: product.special_price,
      date_start: product.special_price_start,
      date_end: product.special_price_end,
    })
      ? product.special_price
      : undefined
  );
  // Log price conversion for debugging
  await logger.info({
    jobId: context.jobId,
    step: "migrate",
    message: `Price conversion for product ${product.product_id}`,
    productId: product.product_id,
    ocPriceRupees: product.price,
    ocSpecialPriceRupees: product.special_price,
    currency: config.medusa.defaultCurrency,
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
          currency_code: config.medusa.defaultCurrency,
          amount,
        },
      ],
    })) ?? payload.variants;
  payload.metadata = {
    ...payload.metadata,
    oc_currency: config.medusa.defaultCurrency,
    oc_regular_price_rupees: regularAmount,
    oc_sale_price_rupees: amount,
    oc_discount_percent: discountPercent,
  };

  if (brand) {
    try {
      payload.collection_id = await upsertCollection(context, brand);
    } catch (error) {
      await logger.warn({
        jobId: context.jobId,
        step: "migrate",
        message: `Failed to upsert collection for brand "${brand}"`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const medusaCategoryIds: string[] = [];
  let fallbackLeafName: string | null = null;

  for (const path of allPaths) {
    let parentMedusaId: string | undefined;
    for (const node of path) {
      const nodeHandle = slugify(node.name);
      if (!nodeHandle) {
        continue;
      }
      try {
        const medusaId = await upsertCategory(
          context,
          node.name,
          nodeHandle,
          parentMedusaId
        );
        parentMedusaId = medusaId;
        medusaCategoryIds.push(medusaId);
      } catch (error) {
        await logger.warn({
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
        } catch (error) {
          await logger.warn({
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
    ? (metadata.oc_tags as string[])
    : typeof metadata.oc_tags === "string"
    ? [metadata.oc_tags]
    : [];
  const extraTags: string[] = [];
  if (/\bpressure\s*cooker\b/i.test(product.name || "")) {
    extraTags.push("Pressure Cooker");
  }
  if (/\bcooker\b/i.test(product.name || "")) {
    extraTags.push("Cooker");
  }
  const rawTags = uniq([...srcTagsArray, ...metadataTags, ...extraTags]);
  metadata.oc_tags = rawTags;
  let tagIds: Array<{ id: string }> = [];
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
            currency_code: config.medusa.defaultCurrency,
            amount: 0,
          },
        ],
      },
    ];
  }
  ensureOptionsForVariants(payload, product.name);

  const finalLeafName =
    allPaths[0]?.[allPaths[0].length - 1]?.name || fallbackLeafName;
  if (finalLeafName) {
    try {
      payload.type_id = await upsertType(context, finalLeafName);
    } catch (error) {
      await logger.warn({
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
    await logger.info({
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
    const created =
      response.data?.product ??
      (response.data && response.data.id ? response.data : null);
    if (!created) {
      throw new Error("Medusa response missing product payload");
    }

    await logger.info({
      jobId: context.jobId,
      step: "migrate",
      message: `Created product ${product.product_id} with status: ${
        created.status || payload.status
      }`,
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
        await logger.info({
          jobId: context.jobId,
          step: "migrate",
          message: `Updated product ${product.product_id} status to published`,
          productId: product.product_id,
          medusaProductId: created.id,
        });
      } catch (error) {
        await logger.warn({
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
      const inventoryItemId = await createInventoryItemForVariant(
        admin,
        variant.id,
        variantSku || `${handle}-${variant.id}`,
        {
          oc_product_id: product.product_id,
          oc_variant_sku: variantSku,
          oc_variant_id: variant.id,
        }
      );

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
          await logger.info({
            jobId: context.jobId,
            step: "migrate",
            message: `✅ Set inventory quantity: ${quantity} for product ${product.product_id}, variant ${variant.id} at location ${locationId}`,
            productId: product.product_id,
            variantId: variant.id,
            quantity,
            locationId,
            inventoryItemId,
          });
        } catch (error) {
          await logger.error({
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
      } else {
        await logger.error({
          jobId: context.jobId,
          step: "migrate",
          message: `No location ID available for product ${product.product_id}, variant ${variant.id}`,
          productId: product.product_id,
          variantId: variant.id,
        });
      }

      const dimensionsPayload: Record<string, number> = {};
      const lengthMm = toMm(
        src.length ?? product.length,
        src.lengthUnit ?? product.length_class_title
      );
      const widthMm = toMm(
        src.width ?? product.width,
        src.lengthUnit ?? product.length_class_title
      );
      const heightMm = toMm(
        src.height ?? product.height,
        src.lengthUnit ?? product.length_class_title
      );
      const weightGrams = toGrams(
        src.weight ?? product.weight,
        src.weightUnit ?? product.weight_class_title
      );

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

      await updateInventoryDimensions(
        admin,
        inventoryItemId,
        dimensionsPayload
      );

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
        } catch (error) {
          await logger.warn({
            jobId: context.jobId,
            step: "migrate",
            message: `Failed to update product metadata with dimensions for variant ${variant.id}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (
      typeof context.salesChannelId === "undefined" ||
      context.salesChannelId === null
    ) {
      context.salesChannelId = await getDefaultSalesChannelId(admin);
    }
    if (
      (!payload.sales_channels || !payload.sales_channels.length) &&
      context.salesChannelId
    ) {
      await addProductToSalesChannel(admin, created.id, context.salesChannelId);
    }
  } catch (error: unknown) {
    let message = "Unknown Medusa error";
    let status: number | undefined;
    let responseData: unknown;

    if (isAxiosError(error)) {
      message = error.message;
      status = error.response?.status;
      responseData = error.response?.data;
    } else if (error instanceof Error) {
      message = error.message;
    }

    await logger.error({
      jobId: context.jobId,
      step: "migrate",
      message: `Failed to create Medusa product ${product.product_id}`,
      error: message,
      status: status ?? "unknown",
      response: responseData ?? null,
      payload,
    });

    throw new Error(
      `Medusa product create failed (product_id=${product.product_id}, status=${
        status ?? "n/a"
      }): ${message}`
    );
  }
}

function assertProductPayload(payload: CreateProductPayload): void {
  if (!Array.isArray(payload.options)) {
    throw new Error("options must be an array");
  }
  const firstOption = payload.options[0];
  if (!firstOption || !Array.isArray(firstOption.values)) {
    throw new Error("options[0].values must be an array");
  }
  if (
    firstOption.values.some(
      (value) => typeof value !== "string" || !value.trim()
    )
  ) {
    throw new Error("options[0].values[] must be strings");
  }
  if (
    payload.variants?.some(
      (variant) => !variant.options || Array.isArray(variant.options)
    )
  ) {
    throw new Error("variant.options must be an object (map)");
  }
}

async function upsertStagingRow(
  context: MigrationContext,
  product: {
    product_id: number;
    name: string;
    model: string | null;
    sku: string | null;
    quantity: number | null;
    price: string;
    special_price: string | null;
    special_price_start?: string | null;
    special_price_end?: string | null;
    description: string | null;
  },
  media: ProductMedia
): Promise<void> {
  if (!context.postgresPool) {
    return;
  }
  const client = await context.postgresPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS staging_opencart_products (
          source_name TEXT NOT NULL,
          source_id INTEGER NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (source_name, source_id)
        )
      `
    );
    await client.query(
      `
        INSERT INTO staging_opencart_products (source_name, source_id, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (source_name, source_id)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      [
        "opencart",
        product.product_id,
        {
          product,
          media,
          mapping: context.mapping,
        },
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processProduct(
  context: MigrationContext,
  product: ProductRow
): Promise<void> {
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

  const pipelineResults: ProcessResult[] = [];

  for (const [index, imageUrl] of candidates.images.entries()) {
    const result = await context.imagePipeline.processImage(
      "oc_product_image",
      `${product.product_id}_${index}`,
      imageUrl
    );
    pipelineResults[index] = result;
    if (result.status === "uploaded" || result.status === "skipped") {
      if (result.status === "uploaded") {
        context.checkpoint.imagesUploaded += 1;
      }
      if (
        result.status === "skipped" &&
        result.error?.includes("OBJECT_STORAGE_BUCKET not configured")
      ) {
        await logger.warn({
          jobId: context.jobId,
          step: "image",
          message:
            "Image retained locally because OBJECT_STORAGE_BUCKET is not configured. Falling back to source URL.",
          productId: product.product_id,
          imageUrl,
        });
      }
    }
    if (result.status === "failed") {
      context.checkpoint.imagesFailed += 1;
      await addJobError(
        context.jobId,
        `Image failure for product ${product.product_id}: ${result.error}`
      );
    }
  }

  const medusaImageSet = new Set<string>();
  const medusaImages: string[] = [];

  for (let index = 0; index < candidates.images.length; index += 1) {
    const candidateUrl = candidates.images[index];
    const processed = pipelineResults[index];

    const preferredUrl =
      processed?.objectUrl && /^https?:\/\//i.test(processed.objectUrl)
        ? processed.objectUrl
        : candidateUrl;

    // Ensure URL is absolute and valid
    const finalUrl =
      preferredUrl && preferredUrl.startsWith("http")
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
    medusaImages.push(placeholderUrl());
  }

  const media: ProductMedia = {
    thumbnail: medusaImages[0],
    images: medusaImages,
    resolved: candidates.resolved,
  };

  await upsertStagingRow(context, product, media);
  await createMedusaProduct(context, product, media);
}

async function fetchSampleProducts(limit: number): Promise<any[]> {
  const sql = `
    SELECT
      p.product_id,
      pd.name,
      p.image
    FROM ${config.mysql.tablePrefix}product p
    INNER JOIN ${config.mysql.tablePrefix}product_description pd
      ON pd.product_id = p.product_id
      AND pd.language_id = ?
    ORDER BY p.date_modified DESC
    LIMIT ?
  `;
  return runQuery(sql, [config.mysql.languageId, limit]);
}

async function generateVerificationReport(
  context: MigrationContext
): Promise<string> {
  const reportDir = path.join(config.paths.reportsDir, context.jobId);
  await ensureDir(reportDir);
  const reportPath = path.join(reportDir, "verification.json");

  const sample = await fetchSampleProducts(DEFAULT_SAMPLE_SIZE);

  const report = {
    summary: context.checkpoint,
    samples: sample,
    generatedAt: new Date().toISOString(),
  };

  await writeJson(reportPath, report);
  await attachArtifact(context.jobId, "verification", reportPath);
  return reportPath;
}

async function writeMigrationReport(
  context: MigrationContext
): Promise<string> {
  const reportDir = path.join(config.paths.reportsDir, context.jobId);
  await ensureDir(reportDir);

  const job = await getJob(context.jobId);
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

  const reportPath = path.join(reportDir, "report.json");
  await writeJson(reportPath, report);
  await attachArtifact(context.jobId, "report", reportPath);
  return reportPath;
}

export async function runMigration(
  jobId: string,
  params: {
    mappingPath?: string;
    mappingJobId?: string;
    resumeFromCheckpoint?: boolean;
    dryRun?: boolean;
    batchSize?: number;
    maxProducts?: number;
  }
): Promise<void> {
  let mappingPath = params.mappingPath ?? process.env.OPENCART_ETL_MAPPING;
  if (!mappingPath && params.mappingJobId) {
    const mappingJob = await getJob(params.mappingJobId);
    mappingPath = mappingJob?.artifacts?.mapping;
    if (!mappingPath) {
      throw new Error(
        `Mapping artifact not found for job ${params.mappingJobId}. Run /discover first.`
      );
    }
  }

  const mapping = await loadMapping(mappingPath);
  const checkpointDir = path.join(config.paths.checkpointsDir, jobId);
  await ensureDir(checkpointDir);
  const checkpointPath = path.join(checkpointDir, "checkpoint.json");
  const dryRun = params.dryRun ?? config.medusa.dryRun ?? false;
  const maxProducts = params.maxProducts;
  // If maxProducts is set and smaller than default batch size, use it as batch size
  const defaultBatchSize = config.worker.batchSize;
  const batchSize =
    params.batchSize ??
    (maxProducts && maxProducts < defaultBatchSize
      ? maxProducts
      : defaultBatchSize);

  const context: MigrationContext = {
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
    imagePipeline: new ImagePipeline(jobId, {
      brandName: undefined,
      productName: undefined,
      productId: undefined,
    }),
    defaultLocationId: undefined,
    salesChannelId: config.medusa.defaultSalesChannelId ?? undefined,
    collectionCache: new Map(),
    typeCache: new Map(),
    categoryCache: new Map(),
    tagCache: new Map(),
  };

  await attachArtifact(jobId, "checkpoint", checkpointPath);

  if (context.medusaClient) {
    try {
      const locationId = await ensureDefaultLocation(context.medusaClient);
      context.defaultLocationId = locationId;
      console.log("[etl] stock location:", locationId);
    } catch (error) {
      await logger.error({
        jobId,
        step: "migrate",
        message: "Failed to resolve default stock location",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    if (
      typeof context.salesChannelId === "undefined" ||
      context.salesChannelId === null
    ) {
      context.salesChannelId = await getDefaultSalesChannelId(
        context.medusaClient
      );
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
          await logger.info({
            jobId,
            step: "migrate",
            message: `Migrated product ${product.product_id}`,
          });
        } catch (error: any) {
          context.checkpoint.failed += 1;
          await addJobError(
            jobId,
            `Failed to migrate product ${product.product_id}`,
            error
          );
        } finally {
          context.checkpoint.processed += 1;
          context.checkpoint.lastProductId = product.product_id;
          await persistCheckpoint(context.checkpointPath, context.checkpoint);
          processedThisRun += 1;
          await updateJobProgress(jobId, {
            total: undefined,
            processed: context.checkpoint.processed,
            succeeded: context.checkpoint.succeeded,
            failed: context.checkpoint.failed,
            stage: "migrate",
            message: `Processed product ${product.product_id}`,
          });
          if (
            typeof maxProducts === "number" &&
            maxProducts > 0 &&
            processedThisRun >= maxProducts
          ) {
            hasMore = false;
            break;
          }
        }
      }

      lastId = batch[batch.length - 1]?.product_id;
    }

    const reportPath = await generateVerificationReport(context);
    await attachArtifact(jobId, "verification_report", reportPath);
    const summaryMessage = `Migration summary processed=${context.checkpoint.processed} succeeded=${context.checkpoint.succeeded} failed=${context.checkpoint.failed}`;
    await logger.info({
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
    await logger.info({
      jobId,
      step: "migrate",
      message: "Migration report written",
      reportPath: finalReportPath,
    });
    await updateJobProgress(jobId, {
      processed: context.checkpoint.processed,
      succeeded: context.checkpoint.succeeded,
      failed: context.checkpoint.failed,
      stage: "migrate",
      message: summaryMessage,
    });
  } finally {
    if (context.postgresPool) {
      await context.postgresPool.end();
    }
  }
}
