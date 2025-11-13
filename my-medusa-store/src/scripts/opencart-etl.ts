import axios, { AxiosInstance } from "axios";
import mysql, { Pool, RowDataPacket } from "mysql2/promise";
import util from "util";

const DEFAULT_PRODUCT_OPTION_TITLE = "Default";
const DEFAULT_PRODUCT_OPTION_VALUE = "Default";
const MAX_TAG_LENGTH = 50;

type OCProduct = {
  product_id: number;
  model: string | null;
  sku: string | null;
  quantity: number | null;
  price: string;
  special_price: string | null;
  effective_price: number;
  image: string | null;
  name: string;
  description: string | null;
  tag: string | null;
  manufacturer: string | null;
  product_type_attribute: string | null;
  collection_names: string[];
  category_names: string[];
  extra_image_paths: string[];
  date_added: string | Date | null;
  date_modified: string | Date | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
};
type RawOCProductRow = {
  product_id: number;
  model: string | null;
  sku: string | null;
  quantity: number | null;
  price: string;
  special_price: string | null;
  effective_price: string;
  image: string | null;
  name: string;
  description: string | null;
  tag: string | null;
  manufacturer: string | null;
  product_type_attribute: string | null;
  collection_names: string | null;
  category_names: string | null;
  extra_images: string | null;
  date_added: Date | string | null;
  date_modified: Date | string | null;
  weight: string | number | null;
  length: string | number | null;
  width: string | number | null;
  height: string | number | null;
};

type OCOptionValueRow = {
  type: string;
  option_name: string;
  product_option_value_id: number;
  value_name: string;
  sku: string | null;
  quantity: number | null;
  price: string | null;
  price_prefix: "+" | "-" | null;
};

type OptionGroup = {
  title: string;
  type: string;
  values: Array<{
    name: string;
    quantity: number | null;
    priceDelta: number;
    sku: string | null;
  }>;
};

type VariantDraft = {
  title: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  inventoryQuantity: number;
  weight?: number | null;
  length?: number | null;
  height?: number | null;
  width?: number | null;
};

type MedusaProductSummary = {
  id: string;
  handle: string;
  metadata?: Record<string, unknown> | null;
  options?: Array<{ id: string; title: string }>;
  variants?: Array<{
    id: string;
    sku: string | null;
    inventory_items?: Array<{
      id?: string;
      inventory_item_id?: string;
    }>;
  }>;
};

type OCCategory = {
  category_id: number;
  parent_id: number;
  name: string;
  description: string | null;
};

const ocCategories = new Map<number, OCCategory>();
const medusaCategoryIdByOcId = new Map<number, string>();
const medusaCategoryIdByHandle = new Map<string, string>();
const medusaTagIdByValue = new Map<string, string>();
const medusaTypeIdByValue = new Map<string, string>();
const medusaCollectionIdByKey = new Map<string, string>();
const medusaChannelIdCache = new Map<string, string>();

const OC_HOST = process.env.OC_HOST ?? process.env.DB_HOST ?? "147.93.31.253";
const OC_PORT = Number(process.env.OC_PORT ?? process.env.DB_PORT ?? 3306);
const OC_USER = process.env.OC_USER ?? process.env.DB_USER ?? "oweg_user2";
const OC_PASSWORD =
  process.env.OC_PASSWORD ?? process.env.DB_PASSWORD ?? "Oweg#@123";
const OC_DATABASE = process.env.OC_DATABASE ?? process.env.DB_NAME ?? "oweg_db";
const OC_TABLE_PREFIX = process.env.OC_TABLE_PREFIX ?? "oc_";
const OC_LANGUAGE_ID = Number(process.env.OC_LANGUAGE_ID ?? 1);
const OC_STORE_ID = Number(process.env.OC_STORE_ID ?? 0);
const OC_IMAGE_BASE_URL =
  process.env.OC_IMAGE_BASE_URL ?? "https://opencart-site.com/image/";

const MEDUSA_URL =
  process.env.MEDUSA_URL?.replace(/\/$/, "") ?? "http://localhost:9000";
const MEDUSA_TOKEN = process.env.MEDUSA_ADMIN_TOKEN ?? process.env.TOKEN ?? "";
const MEDUSA_BASIC_AUTH = MEDUSA_TOKEN
  ? Buffer.from(`${MEDUSA_TOKEN}:`).toString("base64")
  : "";
const MEDUSA_CURRENCY =
  (process.env.MEDUSA_CURRENCY_CODE ?? "inr").toLowerCase() ?? "inr";
const MEDUSA_STOCK_LOCATION_ID = process.env.MEDUSA_LOCATION_ID ?? "";
const MEDUSA_DEFAULT_SALES_CHANNEL_ID =
  process.env.MEDUSA_DEFAULT_SALES_CHANNEL_ID ?? "";

const formatJson = (input: unknown): string =>
  util.inspect(input, { depth: null, colors: false, sorted: true });

function formatAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const data =
      error.response?.data !== undefined
        ? `\n${formatJson(error.response.data)}`
        : "";
    return `[${status ?? "no-status"}${
      statusText ? ` ${statusText}` : ""
    }]${data}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeDescription(description: string | null): string {
  const decoded = decodeHtmlEntities(description ?? "");
  if (!decoded) {
    return "";
  }
  const withBreaks = decoded
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n");
  const withoutTags = withBreaks.replace(/<[^>]*>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function normalizeTagValue(value: string): string | null {
  const decoded = decodeHtmlEntities(value ?? "");
  const stripped = decoded.replace(/<[^>]*>/g, " ");
  const cleaned = stripped.replace(/[^A-Za-z0-9\s\-&]/g, " ");
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }
  return collapsed.slice(0, MAX_TAG_LENGTH);
}

function normalizeDelimitedValues(input: string | null): string[] {
  if (!input) {
    return [];
  }
  return Array.from(
    new Set(
      input
        .split("||")
        .map((value) => decodeHtmlEntities(value))
        .map((value) => value.replace(/<[^>]*>/g, " "))
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => Boolean(value))
    )
  );
}

function serializeMysqlDateTime(input: string | Date | null): string | null {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    return input.toISOString();
  }
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  return parsed.toISOString();
}

function buildImageUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const base = OC_IMAGE_BASE_URL.endsWith("/")
    ? OC_IMAGE_BASE_URL
    : `${OC_IMAGE_BASE_URL}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${base}${normalizedPath}`;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function toNumberOrNull(
  input: string | number | null | undefined
): number | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildProductOptions(
  optionGroups: OptionGroup[]
): Array<{ title: string; values: string[] }> {
  if (!optionGroups.length) {
    return [
      {
        title: DEFAULT_PRODUCT_OPTION_TITLE,
        values: [DEFAULT_PRODUCT_OPTION_VALUE],
      },
    ];
  }
  return optionGroups.map((group) => ({
    title: group.title,
    values: dedupeStrings(
      group.values.map((value) => String(value.name ?? "")).filter(Boolean)
    ),
  }));
}

function buildVariantMedusaPayload(
  draft: VariantDraft,
  product: OCProduct,
  optionDirectory?: Map<string, string>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: draft.title,
    sku: draft.sku,
    prices: [
      {
        currency_code: MEDUSA_CURRENCY,
        amount: draft.price,
      },
    ],
    manage_inventory: true,
    allow_backorder: false,
    metadata: {
      source: "opencart",
      oc_product_id: product.product_id,
      oc_variant_title: draft.title,
      oc_sku: draft.sku,
      oc_weight: draft.weight ?? null,
      oc_length: draft.length ?? null,
      oc_width: draft.width ?? null,
      oc_height: draft.height ?? null,
      oc_inventory_quantity: draft.inventoryQuantity ?? null,
    },
  };

  const optionsEntries = Object.entries(draft.options ?? {});
  if (optionDirectory) {
    const mapped: Record<string, string> = {};
    for (const [title, value] of optionsEntries) {
      const optionId = optionDirectory.get(title);
      if (!optionId) {
        console.warn(
          `[opencart-etl] Option ${title} missing on product when preparing payload for SKU ${draft.sku}.`
        );
        continue;
      }
      mapped[optionId] = String(value);
    }
    if (Object.keys(mapped).length) {
      payload.options = mapped;
    }
  } else if (optionsEntries.length) {
    const mapped: Record<string, string> = {};
    for (const [title, value] of optionsEntries) {
      mapped[title] = String(value);
    }
    if (Object.keys(mapped).length) {
      payload.options = mapped;
    }
  }

  if (draft.weight !== undefined && draft.weight !== null) {
    payload.weight = draft.weight;
  }
  if (draft.length !== undefined && draft.length !== null) {
    payload.length = draft.length;
  }
  if (draft.width !== undefined && draft.width !== null) {
    payload.width = draft.width;
  }
  if (draft.height !== undefined && draft.height !== null) {
    payload.height = draft.height;
  }

  return payload;
}

function resolveVariantFromProductPayload(
  productPayload: any,
  preferredId?: string,
  preferredSku?: string
): any | null {
  if (!productPayload?.variants?.length) {
    return null;
  }
  if (preferredId) {
    const matchById = productPayload.variants.find(
      (variant: any) => variant.id === preferredId
    );
    if (matchById) {
      return matchById;
    }
  }
  if (preferredSku) {
    const matchBySku = productPayload.variants.find(
      (variant: any) => variant.sku === preferredSku
    );
    if (matchBySku) {
      return matchBySku;
    }
  }
  return productPayload.variants[0] ?? null;
}

function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input) {
    return "";
  }
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function findProductByHandle(
  handle: string
): Promise<MedusaProductSummary | null> {
  try {
    const response = await medusaClient.get("/products", {
      params: {
        handle,
        fields:
          "id,handle,metadata,options.id,options.title,variants.id,variants.sku,variants.inventory_items",
      },
    });
    const match =
      response.data?.products?.find(
        (product: any) => product.handle === handle
      ) ?? null;
    return match;
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to lookup product by handle ${handle} ${formatAxiosError(
        error
      )}`
    );
    return null;
  }
}

async function fetchProductById(
  id: string
): Promise<MedusaProductSummary | null> {
  try {
    const response = await medusaClient.get(`/products/${id}`, {
      params: {
        fields:
          "id,handle,metadata,options.id,options.title,variants.id,variants.sku,variants.inventory_items",
      },
    });
    return response.data?.product ?? null;
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to fetch product ${id} ${formatAxiosError(error)}`
    );
    return null;
  }
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...next,
  };
}

function buildOptionDirectory(
  product: MedusaProductSummary | null
): Map<string, string> {
  const directory = new Map<string, string>();
  if (!product?.options?.length) {
    return directory;
  }
  for (const option of product.options) {
    if (option?.title && option?.id) {
      directory.set(option.title, option.id);
    }
  }
  return directory;
}

function buildVariantDirectory(
  product: MedusaProductSummary | null
): Map<string, { id: string; inventory_items?: any[] }> {
  const directory = new Map<string, { id: string; inventory_items?: any[] }>();
  if (!product?.variants?.length) {
    return directory;
  }
  for (const variant of product.variants) {
    if (variant?.id && variant?.sku) {
      directory.set(variant.sku, {
        id: variant.id,
        inventory_items: variant.inventory_items,
      });
    }
  }
  return directory;
}

if (!MEDUSA_TOKEN) {
  console.warn(
    "[opencart-etl] MEDUSA_ADMIN_TOKEN is not set. API calls will fail until you configure it."
  );
}

const BATCH_SIZE = Number(process.env.OC_BATCH_SIZE ?? 25);

let ocPool: Pool;
let medusaClient: AxiosInstance;
let hasOptionValueSkuColumn = true;

async function initClients(): Promise<void> {
  ocPool = mysql.createPool({
    host: OC_HOST,
    port: OC_PORT,
    user: OC_USER,
    password: OC_PASSWORD,
    database: OC_DATABASE,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 5),
    waitForConnections: true,
    enableKeepAlive: true,
  });

  await detectOptionValueSkuColumn();
  await loadCategoryCache();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (MEDUSA_BASIC_AUTH) {
    headers.Authorization = `Basic ${MEDUSA_BASIC_AUTH}`;
  }

  medusaClient = axios.create({
    baseURL: `${MEDUSA_URL}/admin`,
    headers,
  });
}

async function detectOptionValueSkuColumn(): Promise<void> {
  const tableName = mysql.escapeId(`${OC_TABLE_PREFIX}product_option_value`);
  try {
    const [columns] = await ocPool.query(
      `SHOW COLUMNS FROM ${tableName} LIKE 'sku'`
    );
    hasOptionValueSkuColumn =
      Array.isArray(columns) && (columns as any[]).length > 0;
    if (!hasOptionValueSkuColumn) {
      console.warn(
        `[opencart-etl] Column ${tableName}.sku not found. Variant SKUs will fall back to product-level SKUs.`
      );
    }
  } catch (error) {
    hasOptionValueSkuColumn = false;
    console.warn(
      `[opencart-etl] Unable to inspect option value SKU column. Falling back to product-level SKUs.`,
      error instanceof Error ? error.message : error
    );
  }
}

async function loadCategoryCache(): Promise<void> {
  ocCategories.clear();

  const sql = `
    SELECT
      c.category_id,
      c.parent_id,
      cd.name,
      cd.description
    FROM ${mysql.escapeId(`${OC_TABLE_PREFIX}category`)} c
    INNER JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}category_description`)} cd
      ON cd.category_id = c.category_id
      AND cd.language_id = ?
    ORDER BY c.parent_id, c.category_id
  `;

  const [rows] = await ocPool.execute(sql, [OC_LANGUAGE_ID]);
  for (const row of rows as Array<{
    category_id: number;
    parent_id: number;
    name: string;
    description: string | null;
  }>) {
    ocCategories.set(row.category_id, {
      category_id: row.category_id,
      parent_id: row.parent_id ?? 0,
      name: row.name,
      description: row.description,
    });
  }
}

async function fetchProducts(
  limit: number,
  offset: number
): Promise<OCProduct[]> {
  const sql = `
    SELECT
      p.product_id,
      p.model,
      p.sku,
      p.quantity,
      p.price,
      MAX(ps.price) AS special_price,
      COALESCE(MAX(ps.price), p.price) AS effective_price,
      p.image,
      pd.name,
      pd.description,
      pd.tag,
      m.name AS manufacturer,
      MAX(pa_type.text) AS product_type_attribute,
      GROUP_CONCAT(DISTINCT root_cd.name ORDER BY root_cd.name SEPARATOR '||') AS collection_names,
      GROUP_CONCAT(DISTINCT cd.name ORDER BY cd.name SEPARATOR '||') AS category_names,
      GROUP_CONCAT(DISTINCT pi.image ORDER BY pi.sort_order SEPARATOR '||') AS extra_images,
      p.date_added,
      p.date_modified,
      p.weight,
      p.length,
      p.width,
      p.height
    FROM ${mysql.escapeId(`${OC_TABLE_PREFIX}product`)} p
    INNER JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_description`)} pd
      ON pd.product_id = p.product_id
      AND pd.language_id = ?
    INNER JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_to_store`)} pts
      ON pts.product_id = p.product_id
      AND pts.store_id = ?
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}manufacturer`)} m
      ON m.manufacturer_id = p.manufacturer_id
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_attribute`)} pa_type
      ON pa_type.product_id = p.product_id
      AND pa_type.language_id = ?
    LEFT JOIN ${mysql.escapeId(
      `${OC_TABLE_PREFIX}attribute_description`
    )} ad_type
      ON ad_type.attribute_id = pa_type.attribute_id
      AND ad_type.language_id = ?
      AND ad_type.name IN ('Type', 'Product Type', 'Category Type')
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_special`)} ps
      ON ps.product_id = p.product_id
      AND ps.customer_group_id = 1
      AND (ps.date_start = '0000-00-00' OR ps.date_start <= CURDATE())
      AND (ps.date_end = '0000-00-00' OR ps.date_end >= CURDATE())
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_to_category`)} pc
      ON pc.product_id = p.product_id
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}category`)} c
      ON c.category_id = pc.category_id
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}category_description`)} cd
      ON cd.category_id = pc.category_id AND cd.language_id = ?
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}category_path`)} cp_root
      ON cp_root.category_id = pc.category_id
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}category`)} root_c
      ON root_c.category_id = cp_root.path_id AND root_c.parent_id = 0
    LEFT JOIN ${mysql.escapeId(
      `${OC_TABLE_PREFIX}category_description`
    )} root_cd
      ON root_cd.category_id = root_c.category_id AND root_cd.language_id = ?
    LEFT JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_image`)} pi
      ON pi.product_id = p.product_id
    WHERE p.status = 1
    GROUP BY
      p.product_id,
      p.model,
      p.sku,
      p.quantity,
      p.price,
      p.image,
      pd.name,
      pd.description,
      pd.tag,
      m.name,
      p.date_added,
      p.date_modified,
      p.weight,
      p.length,
      p.width,
      p.height
    ORDER BY p.product_id
    LIMIT ?
    OFFSET ?
  `;

  const [rows] = await ocPool.execute<RowDataPacket[]>(sql, [
    OC_LANGUAGE_ID,
    OC_STORE_ID,
    OC_LANGUAGE_ID,
    OC_LANGUAGE_ID,
    OC_LANGUAGE_ID,
    OC_LANGUAGE_ID,
    limit,
    offset,
  ]);

  const typedRows = rows as unknown as RawOCProductRow[];

  return typedRows.map((row) => ({
    product_id: row.product_id,
    model: row.model,
    sku: row.sku,
    quantity: row.quantity,
    price: row.price,
    special_price: row.special_price,
    effective_price: Number(row.effective_price ?? row.price ?? 0),
    image: row.image,
    name: row.name,
    description: row.description,
    tag: row.tag,
    manufacturer: row.manufacturer,
    product_type_attribute: row.product_type_attribute,
    collection_names: normalizeDelimitedValues(row.collection_names),
    category_names: normalizeDelimitedValues(row.category_names),
    extra_image_paths: normalizeDelimitedValues(row.extra_images),
    date_added: row.date_added,
    date_modified: row.date_modified,
    weight: toNumberOrNull(row.weight),
    length: toNumberOrNull(row.length),
    width: toNumberOrNull(row.width),
    height: toNumberOrNull(row.height),
  }));
}

async function fetchProductImages(productId: number): Promise<string[]> {
  const sql = `
    SELECT image
    FROM ${mysql.escapeId(`${OC_TABLE_PREFIX}product_image`)}
    WHERE product_id = ?
    ORDER BY sort_order ASC
  `;
  const [rows] = await ocPool.execute(sql, [productId]);
  return (rows as Array<{ image: string }>)
    .map((row) => buildImageUrl(row.image))
    .filter((url): url is string => Boolean(url));
}

async function fetchProductCategoryIds(productId: number): Promise<number[]> {
  const sql = `
    SELECT category_id
    FROM ${mysql.escapeId(`${OC_TABLE_PREFIX}product_to_category`)}
    WHERE product_id = ?
    ORDER BY category_id
  `;

  const [rows] = await ocPool.execute(sql, [productId]);
  return (rows as Array<{ category_id: number }>).map((row) =>
    Number(row.category_id)
  );
}

async function fetchOptionGroups(productId: number): Promise<OptionGroup[]> {
  const skuColumnSelect = hasOptionValueSkuColumn
    ? ", pov.sku AS option_value_sku"
    : "";
  const sql = `
    SELECT
      o.type,
      od.name AS option_name,
      pov.product_option_value_id,
      ovd.name AS value_name,
      pov.quantity,
      pov.price,
      pov.price_prefix
      ${skuColumnSelect}
    FROM ${mysql.escapeId(`${OC_TABLE_PREFIX}product_option_value`)} pov
    INNER JOIN ${mysql.escapeId(
      `${OC_TABLE_PREFIX}option_value_description`
    )} ovd
      ON ovd.option_value_id = pov.option_value_id
      AND ovd.language_id = ?
    INNER JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}product_option`)} po
      ON po.product_option_id = pov.product_option_id
    INNER JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}option_description`)} od
      ON od.option_id = po.option_id
      AND od.language_id = ?
    INNER JOIN ${mysql.escapeId(`${OC_TABLE_PREFIX}option`)} o
      ON o.option_id = po.option_id
    WHERE po.product_id = ?
    ORDER BY od.name, ovd.name
  `;

  const [rows] = await ocPool.execute(sql, [
    OC_LANGUAGE_ID,
    OC_LANGUAGE_ID,
    productId,
  ]);

  const grouped = new Map<string, OptionGroup>();
  for (const row of rows as OCOptionValueRow[]) {
    if (!grouped.has(row.option_name)) {
      grouped.set(row.option_name, {
        title: row.option_name,
        type: row.type,
        values: [],
      });
    }
    const group = grouped.get(row.option_name)!;
    const optionValueSku =
      hasOptionValueSkuColumn && "sku" in row
        ? (row as any).sku
        : hasOptionValueSkuColumn && "option_value_sku" in row
        ? (row as any).option_value_sku
        : null;

    group.values.push({
      name: row.value_name,
      quantity:
        row.quantity === null || row.quantity === undefined
          ? null
          : Number(row.quantity),
      priceDelta: computePriceDelta(row.price_prefix, row.price),
      sku: optionValueSku,
    });
  }

  return Array.from(grouped.values());
}

function computePriceDelta(
  prefix: OCOptionValueRow["price_prefix"],
  price: OCOptionValueRow["price"]
): number {
  if (!price) {
    return 0;
  }
  const numeric = Number(price);
  if (Number.isNaN(numeric) || numeric === 0) {
    return 0;
  }
  return prefix === "-" ? -numeric : numeric;
}

function buildVariants(
  product: OCProduct,
  optionGroups: OptionGroup[]
): VariantDraft[] {
  const activeGroups = optionGroups.filter((group) => group.values.length > 0);
  if (!activeGroups.length) {
    return [];
  }

  const basePrice = product.effective_price;
  const fallbackQuantity =
    product.quantity === null || product.quantity === undefined
      ? 0
      : Number(product.quantity);
  const weight = product.weight ?? null;
  const length = product.length ?? null;
  const height = product.height ?? null;
  const width = product.width ?? null;

  const combinations = cartesian<OptionGroup>(activeGroups);

  return combinations.map((combo, index) => {
    let variantPrice = basePrice;
    let variantQuantityFallback = fallbackQuantity;
    const options: Record<string, string> = {};
    const skuSuffixParts: string[] = [];

    for (const { group, value } of combo) {
      variantPrice += value.priceDelta;
      if (value.quantity !== null && value.quantity !== undefined) {
        variantQuantityFallback = Math.min(
          variantQuantityFallback || value.quantity,
          value.quantity
        );
      }
      options[group.title] = value.name;
      skuSuffixParts.push(value.name.replace(/\s+/g, "-").toUpperCase());
    }

    const skuBase =
      combo[0]?.value.sku ??
      product.sku ??
      `${product.model ?? "oc"}-${product.product_id}`;

    const sku = `${skuBase}-${skuSuffixParts.join("-")}`;

    return {
      title: combo.map(({ value }) => value.name).join(" / "),
      sku,
      options,
      price: toMinorUnits(variantPrice),
      inventoryQuantity: Number.isFinite(variantQuantityFallback)
        ? variantQuantityFallback
        : fallbackQuantity,
      weight,
      length,
      height,
      width,
    };
  });
}

function cartesian<T extends OptionGroup>(
  groups: T[]
): Array<{ group: T; value: T["values"][number] }[]> {
  if (!groups.length) {
    return [];
  }
  const [first, ...rest] = groups;
  const restCartesian = cartesian(rest);

  if (!rest.length) {
    return first.values.map((value) => [{ group: first, value }]);
  }

  const result: Array<{ group: T; value: T["values"][number] }[]> = [];
  for (const value of first.values) {
    if (!restCartesian.length) {
      result.push([{ group: first, value }]);
      continue;
    }
    for (const combo of restCartesian) {
      result.push([{ group: first, value }, ...combo]);
    }
  }
  return result;
}

function toMinorUnits(price: number): number {
  return Math.round(price * 100);
}

function slugify(input: string, fallback: string): string {
  const base = (input || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = base.substring(0, 60);
  const normalized = truncated.replace(/^-+|-+$/g, "");
  return normalized || fallback.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildProductHandle(product: OCProduct): string {
  const base = slugify(product.name, `${product.product_id}`);
  const suffix = `${product.product_id}`;
  if (base.endsWith(suffix)) {
    return base;
  }
  const delimiter = "-";
  const maxLength = 60;
  const suffixWithDelimiter = `${delimiter}${suffix}`;
  if (base.length + suffixWithDelimiter.length <= maxLength) {
    return `${base}${suffixWithDelimiter}`;
  }
  const allowedBaseLength = Math.max(0, maxLength - suffixWithDelimiter.length);
  const trimmedBase = base.substring(0, allowedBaseLength).replace(/-+$/g, "");
  const normalizedBase = trimmedBase || slugify("", suffix);
  return `${normalizedBase}${suffixWithDelimiter}`;
}

function extractTagValues(tagField: string | null): string[] {
  if (!tagField) {
    return [];
  }
  return Array.from(
    new Set(
      tagField
        .split(",")
        .map((value) => normalizeTagValue(value))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function buildCategoryHandle(category: OCCategory): string {
  return slugify(
    category.name,
    `oc-category-${category.category_id.toString()}`
  );
}

function getTopLevelCategoryId(categoryId: number): number | null {
  let current = ocCategories.get(categoryId);
  const safetyLimit = 32;
  let hops = 0;

  while (current && current.parent_id && current.parent_id !== 0) {
    hops += 1;
    if (hops > safetyLimit) {
      console.warn(
        `[opencart-etl] Detected unusually deep category tree while resolving parent for category ${categoryId}.`
      );
      break;
    }
    current = ocCategories.get(current.parent_id);
  }

  return current ? current.category_id : null;
}

async function ensureProductCategory(
  ocCategoryId: number
): Promise<string | null> {
  if (medusaCategoryIdByOcId.has(ocCategoryId)) {
    return medusaCategoryIdByOcId.get(ocCategoryId)!;
  }

  const category = ocCategories.get(ocCategoryId);
  if (!category) {
    console.warn(
      `[opencart-etl] Skipping missing OpenCart category ${ocCategoryId}.`
    );
    return null;
  }

  let parentId: string | null = null;
  if (category.parent_id && category.parent_id !== 0) {
    parentId = await ensureProductCategory(category.parent_id);
  }

  const handle = buildCategoryHandle(category);
  if (medusaCategoryIdByHandle.has(handle)) {
    const existingId = medusaCategoryIdByHandle.get(handle)!;
    medusaCategoryIdByOcId.set(ocCategoryId, existingId);
    return existingId;
  }

  try {
    const existing = await medusaClient.get("/product-categories", {
      params: { handle },
    });
    const match =
      existing.data?.product_categories?.find(
        (cat: any) => cat.handle === handle
      ) ?? null;

    if (match) {
      medusaCategoryIdByHandle.set(handle, match.id);
      medusaCategoryIdByOcId.set(ocCategoryId, match.id);
      return match.id;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to lookup product category ${
        category.name
      } ${formatAxiosError(error)}`
    );
  }

  try {
    const payload: Record<string, unknown> = {
      name: category.name || `OC Category ${category.category_id}`,
      handle,
      metadata: {
        oc_category_id: category.category_id,
        oc_parent_id: category.parent_id || null,
      },
    };
    if (category.description) {
      payload.description = category.description;
    }
    if (parentId) {
      payload.parent_category_id = parentId;
    }

    const response = await medusaClient.post("/product-categories", payload);
    const createdId = response.data?.product_category?.id;
    if (createdId) {
      medusaCategoryIdByHandle.set(handle, createdId);
      medusaCategoryIdByOcId.set(ocCategoryId, createdId);
      return createdId;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to create product category for ${
        category.name
      } ${formatAxiosError(error)}`
    );
  }

  return null;
}

async function ensureProductCategories(
  categoryIds: number[]
): Promise<string[]> {
  const unique = Array.from(new Set(categoryIds));
  const medusaIds: string[] = [];

  for (const categoryId of unique) {
    const medusaId = await ensureProductCategory(categoryId);
    if (medusaId) {
      medusaIds.push(medusaId);
    }
  }

  return medusaIds;
}

async function ensureProductTag(value: string): Promise<string | null> {
  const normalized = normalizeTagValue(value);
  if (!normalized) {
    return null;
  }

  const cacheKey = normalized.toLowerCase();
  if (medusaTagIdByValue.has(cacheKey)) {
    return medusaTagIdByValue.get(cacheKey)!;
  }

  try {
    const existing = await medusaClient.get("/product-tags", {
      params: { q: normalized, limit: 50 },
    });
    const match =
      existing.data?.product_tags?.find(
        (tag: any) => tag.value?.toLowerCase() === cacheKey
      ) ?? null;
    if (match) {
      medusaTagIdByValue.set(cacheKey, match.id);
      return match.id;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to lookup product tag "${normalized}" ${formatAxiosError(
        error
      )}`
    );
  }

  try {
    const response = await medusaClient.post("/product-tags", {
      value: normalized,
      metadata: { source: "opencart" },
    });
    const createdId = response.data?.product_tag?.id;
    if (createdId) {
      medusaTagIdByValue.set(cacheKey, createdId);
      return createdId;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to create product tag "${normalized}" ${formatAxiosError(
        error
      )}`
    );
  }

  return null;
}

async function ensureProductTags(values: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const value of values) {
    const id = await ensureProductTag(value);
    if (id) {
      ids.push(id);
    }
  }
  return Array.from(new Set(ids));
}

function resolveProductTypeSource(product: OCProduct): string | null {
  const attributeType = product.product_type_attribute?.trim();
  if (attributeType) {
    return attributeType;
  }
  const manufacturer = product.manufacturer?.trim();
  if (manufacturer) {
    return manufacturer;
  }
  return null;
}

async function ensureProductType(
  typeValue: string | null
): Promise<string | null> {
  const normalized = typeValue?.trim();
  if (!normalized) {
    return null;
  }

  const cacheKey = normalized.toLowerCase();
  if (medusaTypeIdByValue.has(cacheKey)) {
    return medusaTypeIdByValue.get(cacheKey)!;
  }

  try {
    const existing = await medusaClient.get("/product-types", {
      params: { value: normalized },
    });
    const match =
      existing.data?.product_types?.find(
        (type: any) => type.value?.toLowerCase() === cacheKey
      ) ?? null;
    if (match) {
      medusaTypeIdByValue.set(cacheKey, match.id);
      return match.id;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to lookup product type "${normalized}" ${formatAxiosError(
        error
      )}`
    );
  }

  try {
    const response = await medusaClient.post("/product-types", {
      value: normalized,
      metadata: { source: "opencart" },
    });
    const createdId = response.data?.product_type?.id;
    if (createdId) {
      medusaTypeIdByValue.set(cacheKey, createdId);
      return createdId;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to create product type "${normalized}" ${formatAxiosError(
        error
      )}`
    );
  }

  return null;
}

async function ensureCollectionForCategories(
  categoryIds: number[]
): Promise<string | null> {
  if (!categoryIds.length) {
    return null;
  }

  const topLevelId = getTopLevelCategoryId(categoryIds[0]);
  if (!topLevelId) {
    return null;
  }

  const cacheKey = `oc-collection-${topLevelId}`;
  if (medusaCollectionIdByKey.has(cacheKey)) {
    return medusaCollectionIdByKey.get(cacheKey)!;
  }

  const topCategory = ocCategories.get(topLevelId);
  if (!topCategory) {
    return null;
  }

  const handle = slugify(
    topCategory.name,
    `oc-collection-${topLevelId.toString()}`
  );

  try {
    const existing = await medusaClient.get("/collections", {
      params: { handle },
    });
    const match =
      existing.data?.collections?.find((col: any) => col.handle === handle) ??
      null;
    if (match) {
      medusaCollectionIdByKey.set(cacheKey, match.id);
      return match.id;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to lookup product collection "${
        topCategory.name
      }" ${formatAxiosError(error)}`
    );
  }

  try {
    const response = await medusaClient.post("/collections", {
      title: topCategory.name || `OC Collection ${topLevelId}`,
      handle,
      metadata: { source: "opencart", oc_category_id: topLevelId },
    });
    const createdId = response.data?.collection?.id;
    if (createdId) {
      medusaCollectionIdByKey.set(cacheKey, createdId);
      return createdId;
    }
  } catch (error) {
    console.error(
      `[opencart-etl] Failed to create product collection "${
        topCategory.name
      }" ${formatAxiosError(error)}`
    );
  }

  return null;
}

async function upsertProduct(product: OCProduct) {
  const optionGroups = await fetchOptionGroups(product.product_id);
  const variantsFromOptions = buildVariants(product, optionGroups);
  const ocCategoryIds = await fetchProductCategoryIds(product.product_id);
  const medusaCategoryIds = await ensureProductCategories(ocCategoryIds);
  const collectionId = await ensureCollectionForCategories(ocCategoryIds);
  const tagValues = extractTagValues(product.tag);
  const tagIds = await ensureProductTags(tagValues);
  const resolvedProductType = resolveProductTypeSource(product);
  const typeId = await ensureProductType(resolvedProductType);
  const handle = buildProductHandle(product);
  const primaryImageUrl = buildImageUrl(product.image);
  const fetchedGalleryImages = await fetchProductImages(product.product_id);
  const galleryImages = dedupeStrings([
    ...(primaryImageUrl ? [primaryImageUrl] : []),
    ...fetchedGalleryImages,
  ]);
  const extraImageUrls = dedupeStrings(
    product.extra_image_paths
      .map((path) => buildImageUrl(path))
      .filter((url): url is string => Boolean(url))
  ).filter((url) => !primaryImageUrl || url !== primaryImageUrl);
  const basePriceNumeric = toNumberOrNull(product.price) ?? 0;
  const specialPriceNumeric = toNumberOrNull(product.special_price);

  const baseMetadata = {
    source: "opencart",
    oc_product_id: product.product_id,
    oc_model: product.model,
    oc_manufacturer: product.manufacturer,
    oc_product_type_attribute: product.product_type_attribute,
    oc_category_ids: ocCategoryIds,
    oc_tags: tagValues,
    oc_collection_names: product.collection_names,
    oc_category_names: product.category_names,
    oc_extra_image_paths: product.extra_image_paths,
    oc_extra_image_urls: extraImageUrls,
    oc_base_price: basePriceNumeric,
    oc_special_price: specialPriceNumeric,
    oc_effective_price: product.effective_price,
    oc_date_added: serializeMysqlDateTime(product.date_added),
    oc_date_modified: serializeMysqlDateTime(product.date_modified),
    oc_weight: product.weight,
    oc_length: product.length,
    oc_width: product.width,
    oc_height: product.height,
  };

  const productOptions = buildProductOptions(optionGroups);

  const basePayload: Record<string, unknown> = {
    title: product.name,
    handle,
    subtitle: product.model ?? undefined,
    description: normalizeDescription(product.description),
    thumbnail: galleryImages[0] ?? null,
    images: galleryImages.map((url) => ({ url })),
    status: "published",
    metadata: baseMetadata,
    options: productOptions,
  };

  if (medusaCategoryIds.length) {
    basePayload.categories = medusaCategoryIds.map((id) => ({ id }));
  }
  if (tagIds.length) {
    basePayload.tags = tagIds.map((id) => ({ id }));
  }
  if (collectionId) {
    basePayload.collection_id = collectionId;
  }
  if (typeId) {
    basePayload.type_id = typeId;
  }
  if (product.weight !== null && product.weight !== undefined) {
    basePayload.weight = product.weight;
  }
  if (product.length !== null && product.length !== undefined) {
    basePayload.length = product.length;
  }
  if (product.width !== null && product.width !== undefined) {
    basePayload.width = product.width;
  }
  if (product.height !== null && product.height !== undefined) {
    basePayload.height = product.height;
  }

  const variantDrafts =
    variantsFromOptions.length > 0
      ? variantsFromOptions
      : [
          {
            title: "Default",
            sku: product.sku ?? product.model ?? `OC-${product.product_id}`,
            options: {
              [DEFAULT_PRODUCT_OPTION_TITLE]: DEFAULT_PRODUCT_OPTION_VALUE,
            },
            price: toMinorUnits(product.effective_price),
            inventoryQuantity:
              product.quantity === null || product.quantity === undefined
                ? 0
                : Number(product.quantity),
            weight: product.weight,
            length: product.length,
            height: product.height,
            width: product.width,
          },
        ];

  const existingSummary = await findProductByHandle(handle);
  const existingDetailed =
    existingSummary?.id && existingSummary.handle
      ? await fetchProductById(existingSummary.id)
      : null;

  if (existingSummary?.id) {
    const existingMetadata =
      existingDetailed?.metadata ?? existingSummary.metadata ?? {};
    const existingOptionDirectory = buildOptionDirectory(
      existingDetailed ?? existingSummary
    );
    const updatePayload: Record<string, unknown> = {
      ...basePayload,
      metadata: mergeMetadata(
        existingMetadata as Record<string, unknown>,
        baseMetadata
      ),
      options: productOptions.map((option) => {
        const optionId = existingOptionDirectory.get(option.title);
        return optionId
          ? { id: optionId, title: option.title, values: option.values }
          : option;
      }),
    };

    const updateResponse = await medusaClient.post(
      `/products/${existingSummary.id}`,
      updatePayload
    );
    const updatedProduct =
      updateResponse.data?.product ?? existingDetailed ?? existingSummary;
    const refreshedProduct =
      (await fetchProductById(updatedProduct.id)) ?? updatedProduct;
    const optionDirectory = buildOptionDirectory(refreshedProduct);
    const variantDirectory = buildVariantDirectory(refreshedProduct);

    await syncVariantsForProduct(
      existingSummary.id,
      variantDrafts,
      product,
      optionDirectory,
      variantDirectory
    );
    return;
  }

  const createPayload = {
    ...basePayload,
    variants: variantDrafts.map((draft) =>
      buildVariantMedusaPayload(draft, product)
    ),
  };

  const response = await medusaClient.post("/products", createPayload);
  const createdProduct = response.data.product;
  const refreshedProduct =
    (await fetchProductById(createdProduct.id)) ?? createdProduct;
  const optionDirectory = buildOptionDirectory(refreshedProduct);
  const variantDirectory = buildVariantDirectory(refreshedProduct);

  await syncVariantsForProduct(
    createdProduct.id,
    variantDrafts,
    product,
    optionDirectory,
    variantDirectory
  );
}

async function syncVariantsForProduct(
  medusaProductId: string,
  variantDrafts: VariantDraft[],
  sourceProduct: OCProduct,
  optionDirectory: Map<string, string>,
  existingVariantDirectory?: Map<
    string,
    { id: string; inventory_items?: any[] }
  >
): Promise<void> {
  for (const draft of variantDrafts) {
    const variantPayload = buildVariantMedusaPayload(
      draft,
      sourceProduct,
      optionDirectory
    );

    const existingVariant = existingVariantDirectory?.get(draft.sku);

    if (existingVariant) {
      try {
        const variantResponse = await medusaClient.post(
          `/products/${medusaProductId}/variants/${existingVariant.id}`,
          variantPayload
        );
        const updatedProduct = variantResponse.data?.product;
        let updatedVariant = resolveVariantFromProductPayload(
          updatedProduct,
          existingVariant.id,
          draft.sku
        );
        if (!updatedVariant) {
          const refreshedProduct = await fetchProductById(medusaProductId);
          updatedVariant = resolveVariantFromProductPayload(
            refreshedProduct,
            existingVariant.id,
            draft.sku
          );
        }
        const inventoryItemId = extractInventoryItemId(
          updatedVariant ?? existingVariant
        );
        if (inventoryItemId && MEDUSA_STOCK_LOCATION_ID) {
          await upsertInventoryLevel(
            inventoryItemId,
            draft.inventoryQuantity ?? 0
          );
        } else if (!MEDUSA_STOCK_LOCATION_ID) {
          console.warn(
            `[opencart-etl] MEDUSA_LOCATION_ID missing. Skipping inventory level for variant ${existingVariant.id}.`
          );
        } else {
          console.warn(
            `[opencart-etl] Unable to resolve inventory item for variant ${existingVariant.id}.`
          );
        }
        if (updatedVariant && existingVariantDirectory) {
          existingVariantDirectory.set(draft.sku, {
            id: updatedVariant.id ?? existingVariant.id,
            inventory_items: updatedVariant.inventory_items,
          });
        }
      } catch (variantError) {
        console.error(
          `[opencart-etl] Failed to update variant ${
            existingVariant.id
          } for product ${medusaProductId} ${formatAxiosError(variantError)}`
        );
      }
      continue;
    }

    try {
      const variantResponse = await medusaClient.post(
        `/products/${medusaProductId}/variants`,
        variantPayload
      );
      const responseProduct = variantResponse.data?.product;
      let createdVariant = resolveVariantFromProductPayload(
        responseProduct,
        undefined,
        draft.sku
      );
      if (!createdVariant) {
        const refreshedProduct = await fetchProductById(medusaProductId);
        createdVariant = resolveVariantFromProductPayload(
          refreshedProduct,
          undefined,
          draft.sku
        );
      }
      if (!createdVariant) {
        console.warn(
          `[opencart-etl] Unable to resolve created variant for product ${medusaProductId} (sku ${draft.sku}).`
        );
        continue;
      }

      const inventoryItemId = extractInventoryItemId(createdVariant);
      if (inventoryItemId && MEDUSA_STOCK_LOCATION_ID) {
        await upsertInventoryLevel(
          inventoryItemId,
          draft.inventoryQuantity ?? 0
        );
      } else if (!MEDUSA_STOCK_LOCATION_ID) {
        console.warn(
          `[opencart-etl] MEDUSA_LOCATION_ID missing. Skipping inventory level for variant ${createdVariant.id}.`
        );
      } else {
        console.warn(
          `[opencart-etl] Unable to resolve inventory item for variant ${createdVariant.id}.`
        );
      }
      if (existingVariantDirectory) {
        existingVariantDirectory.set(draft.sku, {
          id: createdVariant.id,
          inventory_items: createdVariant.inventory_items,
        });
      }
    } catch (variantError) {
      console.error(
        `[opencart-etl] Failed to create variant for product ${medusaProductId} (${
          sourceProduct.name
        }) ${formatAxiosError(variantError)}`
      );
    }
  }
}

function extractInventoryItemId(variant: any): string | null {
  if (!variant) {
    return null;
  }
  if (variant.inventory_items?.length) {
    const withId =
      variant.inventory_items.find(
        (item: any) => item.inventory_item_id || item.id
      ) ?? variant.inventory_items[0];
    return withId.inventory_item_id ?? withId.id ?? null;
  }
  if (variant.inventory_item_id) {
    return variant.inventory_item_id;
  }
  if (variant.inventory?.inventory_item?.id) {
    return variant.inventory.inventory_item.id;
  }
  return null;
}

async function upsertInventoryLevel(inventoryItemId: string, quantity: number) {
  if (!inventoryItemId) {
    return;
  }
  try {
    await medusaClient.post(
      `/inventory-items/${inventoryItemId}/location-levels`,
      {
        location_id: MEDUSA_STOCK_LOCATION_ID,
        stocked_quantity: Math.max(quantity, 0),
        incoming_quantity: 0,
      }
    );
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      // Fallback: level exists, attempt update
      try {
        await medusaClient.post(
          `/inventory-items/${inventoryItemId}/location-levels/${MEDUSA_STOCK_LOCATION_ID}`,
          {
            stocked_quantity: Math.max(quantity, 0),
            incoming_quantity: 0,
          }
        );
      } catch (updateError) {
        console.error(
          `[opencart-etl] Failed to update inventory level for ${inventoryItemId} ${formatAxiosError(
            updateError
          )}`
        );
      }
      return;
    }
    console.error(
      `[opencart-etl] Failed to create inventory level for ${inventoryItemId} ${formatAxiosError(
        error
      )}`
    );
  }
}

async function main(): Promise<void> {
  await initClients();

  let offset = 0;
  while (true) {
    const products = await fetchProducts(BATCH_SIZE, offset);
    if (!products.length) {
      console.log("[opencart-etl] No more products to process.");
      break;
    }

    console.log(
      `[opencart-etl] Processing products ${offset + 1} - ${
        offset + products.length
      }`
    );

    for (const product of products) {
      try {
        await upsertProduct(product);
        console.log(
          `[opencart-etl] Imported product ${product.product_id} (${product.name})`
        );
      } catch (error) {
        console.error(
          `[opencart-etl] Failed to import product ${product.product_id} (${
            product.name
          }) ${formatAxiosError(error)}`
        );
      }
    }

    offset += products.length;
  }

  await ocPool.end();
  console.log("[opencart-etl] ETL completed.");
}

export default async function run(): Promise<void> {
  await main();
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        `[opencart-etl] Unhandled error: ${formatAxiosError(error)}`
      );
      process.exit(1);
    });
}
