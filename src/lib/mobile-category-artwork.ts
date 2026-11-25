import { catalogIconKey, catalogIconSrc, type CatalogIconKind } from "./catalog-icons";
import { mobileCategoryArtworkFiles } from "./mobile-category-artwork-files";

export function mobileCategoryArtwork(kind: CatalogIconKind, handle?: string, title?: string) {
  const icon = catalogIconSrc(kind, handle, title);
  const originalKey = icon?.split("/").at(-1)?.replace(/\.svg$/, "");
  const filename = [kind + "-" + catalogIconKey(handle), originalKey, kind + "-" + catalogIconKey(title)]
    .find(key => key && mobileCategoryArtworkFiles.has(key));
  return filename ? "/images/mobile-categories/v1/" + filename + ".webp" : null;
}
