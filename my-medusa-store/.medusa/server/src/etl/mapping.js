"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MAPPING = void 0;
exports.generateMapping = generateMapping;
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const job_manager_1 = require("./job-manager");
const utils_1 = require("./utils");
exports.DEFAULT_MAPPING = {
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
async function generateMapping(jobId) {
    const mappingDir = config_1.config.paths.mappingsDir;
    await (0, utils_1.ensureDir)(mappingDir);
    const mappingPath = path_1.default.join(mappingDir, `${jobId}.json`);
    await (0, utils_1.writeJson)(mappingPath, exports.DEFAULT_MAPPING);
    await (0, job_manager_1.attachArtifact)(jobId, "mapping", mappingPath);
    return mappingPath;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwcGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9ldGwvbWFwcGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFtQkEsMENBT0M7QUExQkQsZ0RBQXdCO0FBQ3hCLHFDQUFrQztBQUNsQywrQ0FBK0M7QUFDL0MsbUNBQStDO0FBRWxDLFFBQUEsZUFBZSxHQUFHO0lBQzdCLHVCQUF1QixFQUFFLFdBQVc7SUFDcEMsa0JBQWtCLEVBQUUsS0FBSztJQUN6QixnQkFBZ0IsRUFBRSxhQUFhO0lBQy9CLHFCQUFxQixFQUFFLG9CQUFvQjtJQUMzQyxrQkFBa0IsRUFBRSxPQUFPO0lBQzNCLDBCQUEwQixFQUFFLGVBQWU7SUFDM0MsNkJBQTZCLEVBQUUsT0FBTztJQUN0QyxvQ0FBb0MsRUFBRSxhQUFhO0lBQ25ELHdCQUF3QixFQUFFLGVBQWU7SUFDekMsb0NBQW9DLEVBQUUsZ0JBQWdCO0lBQ3RELG9CQUFvQixFQUFFLFFBQVE7Q0FDL0IsQ0FBQztBQUVLLEtBQUssVUFBVSxlQUFlLENBQUMsS0FBYTtJQUNqRCxNQUFNLFVBQVUsR0FBRyxlQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQztJQUM1QyxNQUFNLElBQUEsaUJBQVMsRUFBQyxVQUFVLENBQUMsQ0FBQztJQUM1QixNQUFNLFdBQVcsR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLEtBQUssT0FBTyxDQUFDLENBQUM7SUFDM0QsTUFBTSxJQUFBLGlCQUFTLEVBQUMsV0FBVyxFQUFFLHVCQUFlLENBQUMsQ0FBQztJQUM5QyxNQUFNLElBQUEsNEJBQWMsRUFBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sV0FBVyxDQUFDO0FBQ3JCLENBQUMifQ==