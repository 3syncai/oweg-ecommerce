"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

export type ReturnPhoto = { file: File; order_item_id: string };
type Item = { order_item_id: string; title?: string; selected: boolean };

function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? <Image src={url} alt="Selected return photo" width={64} height={64} unoptimized className="h-16 w-16 rounded-lg object-cover" /> : null;
}

export function ReturnPhotoPicker({ items, photos, onChange, disabled }: {
  items: Item[]; photos: ReturnPhoto[]; onChange: (photos: ReturnPhoto[]) => void; disabled: boolean;
}) {
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState("");
  const selected = items.filter((item) => item.selected);
  const currentItem = selected.some((item) => item.order_item_id === itemId) ? itemId : selected[0]?.order_item_id || "";
  return <section className="mt-5 space-y-3 rounded-xl border border-gray-200 p-3" aria-label="Return photos">
    <div><p className="text-sm font-semibold text-gray-800">Add photos (optional)</p>
      <p className="mt-1 text-xs text-gray-500">Show the issue with the item or packaging. Up to 5 JPG, PNG or WebP photos, 3 MB each.</p></div>
    {selected.length > 1 && <label className="block text-xs font-medium text-gray-700">Photo is for
      <select aria-label="Item for return photos" value={currentItem} disabled={disabled} onChange={(event) => setItemId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm">
        {selected.map((item) => <option key={item.order_item_id} value={item.order_item_id}>{item.title || "Item"}</option>)}
      </select></label>}
    <label className="block text-xs font-medium text-gray-700">Choose photos
      <input type="file" aria-label="Choose return photos" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || !currentItem || photos.length >= 5}
        className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-700 disabled:opacity-50"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (photos.length + files.length > 5) { setError("You can attach up to 5 photos."); return; }
          if (files.some((file) => !file.size || file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
            setError("Choose JPG, PNG or WebP photos, no larger than 3 MB each."); return;
          }
          setError("");
          onChange([...photos, ...files.map((file) => ({ file, order_item_id: currentItem }))]);
        }} /></label>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {photos.map((photo, index) => <div key={`${photo.file.name}-${index}`} className="flex items-center gap-3 rounded-lg bg-gray-50 p-2">
      <Preview file={photo.file} /><div className="min-w-0 flex-1"><p className="truncate text-xs">{photo.file.name}</p>
        <p className="text-xs text-gray-500">{items.find((item) => item.order_item_id === photo.order_item_id)?.title || "Item"}</p>
        {!selected.some((item) => item.order_item_id === photo.order_item_id) && <p className="text-xs text-amber-700">This item is not selected; its photo will not be submitted.</p>}
      </div><button type="button" disabled={disabled} aria-label={`Remove photo ${index + 1}`} onClick={() => onChange(photos.filter((_, position) => position !== index))} className="text-xs font-medium text-red-600">Remove</button>
    </div>)}
    <p className="text-xs text-gray-500">Photos are shared with our returns team and the seller of the photographed item.</p>
  </section>;
}
