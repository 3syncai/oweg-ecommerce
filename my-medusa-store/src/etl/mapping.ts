import path from "path";
import { config } from "./config";
import { attachArtifact } from "./job-manager";
import { writeJson, ensureDir } from "./utils";

export const DEFAULT_MAPPING = {
  "oc_product.product_id": "source_id",
  "oc_product.model": "sku",
  "oc_product.sku": "variant_sku",
  "oc_product.quantity": "inventory_quantity",
  "oc_product.price": "price",
  "oc_product_special.price": "special_price",
  "oc_product_description.name": "title",
  "oc_product_description.description": "description",
  "oc_product_image.image": "image_paths[]",
  "oc_product_to_category.category_id": "category_ids[]",
  "oc_product_tag.tag": "tags[]",
};

export async function generateMapping(jobId: string): Promise<string> {
  const mappingDir = config.paths.mappingsDir;
  await ensureDir(mappingDir);
  const mappingPath = path.join(mappingDir, `${jobId}.json`);
  await writeJson(mappingPath, DEFAULT_MAPPING);
  await attachArtifact(jobId, "mapping", mappingPath);
  return mappingPath;
}
