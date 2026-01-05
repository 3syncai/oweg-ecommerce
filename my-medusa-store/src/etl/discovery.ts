import { describeTable, listTables, runQuery } from "./mysql-client";
import { DiscoverResponse, DiscoverResultTable } from "./types";

const PRODUCT_COLUMN_HINTS = [
  "product_id",
  "name",
  "model",
  "sku",
  "description",
];
const IMAGE_COLUMN_HINTS = [
  "image",
  "thumb",
  "filename",
  "product_image",
  "image_path",
];

const WEIGHTED_KEYWORDS: Array<{ keyword: string; weight: number }> = [
  { keyword: "product_id", weight: 3 },
  { keyword: "image", weight: 2 },
  { keyword: "description", weight: 1 },
  { keyword: "category", weight: 1 },
  { keyword: "variant", weight: 1 },
  { keyword: "option", weight: 1 },
  { keyword: "inventory", weight: 1 },
];

async function fetchRowCount(tableName: string): Promise<number | undefined> {
  try {
    const rows = await runQuery(
      `SELECT COUNT(*) AS count FROM \`${tableName}\` LIMIT 1`
    ) as Array<{ count: number }>;
    return rows[0]?.count ?? undefined;
  } catch (error) {
    return undefined;
  }
}

function scoreTable(table: DiscoverResultTable): number {
  const columnNames = table.columns.map((column) => column.name.toLowerCase());
  let score = 0;
  for (const hint of PRODUCT_COLUMN_HINTS) {
    if (columnNames.includes(hint)) {
      score += 2;
    }
  }
  for (const hint of IMAGE_COLUMN_HINTS) {
    if (columnNames.includes(hint)) {
      score += 1;
    }
  }
  for (const { keyword, weight } of WEIGHTED_KEYWORDS) {
    if (columnNames.some((column) => column.includes(keyword))) {
      score += weight;
    }
  }
  return score;
}

export async function discoverSchema(): Promise<DiscoverResponse> {
  const tables = await listTables();
  const result: DiscoverResultTable[] = [];

  for (const table of tables) {
    const columns = await describeTable(table.tableName);
    const columnsInfo = columns.map((column) => ({
      name: column.Field,
      type: column.Type,
      nullable: column.Null === "YES",
      key: column.Key ?? null,
      default: column.Default ?? null,
      extra: column.Extra ?? null,
    }));

    const rowCount = await fetchRowCount(table.tableName);

    const discoverTable: DiscoverResultTable = {
      name: table.tableName,
      schema: table.tableSchema,
      columns: columnsInfo,
      rows: rowCount,
      candidateScore: 0,
      tags: [],
    };

    const tagSet = new Set<string>();
    const lowerColumns = columnsInfo.map((column) =>
      column.name.toLowerCase()
    );
    if (lowerColumns.includes("product_id")) {
      tagSet.add("product_id");
    }
    if (lowerColumns.includes("image")) {
      tagSet.add("image");
    }
    if (lowerColumns.includes("name")) {
      tagSet.add("name");
    }
    if (table.tableName.includes("description")) {
      tagSet.add("description");
    }
    if (table.tableName.includes("category")) {
      tagSet.add("category");
    }

    discoverTable.tags = Array.from(tagSet.values());
    discoverTable.candidateScore = scoreTable(discoverTable);
    result.push(discoverTable);
  }

  const candidates = result
    .filter((table) => table.candidateScore >= 3)
    .sort((a, b) => b.candidateScore - a.candidateScore)
    .map((table) => table.name);

  return {
    tables: result,
    candidates,
  };
}


