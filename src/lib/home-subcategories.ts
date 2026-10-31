import type { MedusaCategory } from './medusa';

export const COOKWARE_GROUP_ID = 'oweg-non-stick-cookware';
export const COOKWARE_GROUP_HANDLE = 'non-stick-cookware';
export const COMPUTER_INPUT_GROUP_ID = 'oweg-mouse-keyboard';
export const COMPUTER_INPUT_GROUP_HANDLE = 'mouse-keyboard';
const COOKWARE_HANDLES = new Set([
  'kitchen-appliances-kadai',
  'kitchen-appliances-tawa',
  'kitchen-appliances-fry-pan',
]);

/** A storefront grouping only; the underlying catalogue stays unchanged. */
export function cookwareCategory(categories: MedusaCategory[]): MedusaCategory {
  return categoryGroup(categories, COOKWARE_GROUP_ID, COOKWARE_GROUP_HANDLE, 'Non-Stick Cookware', COOKWARE_HANDLES);
}

export function storefrontCategoryGroup(key: string, categories: MedusaCategory[]): MedusaCategory | undefined {
  if (key === COOKWARE_GROUP_ID || key === COOKWARE_GROUP_HANDLE) return cookwareCategory(categories);
  if (key === COMPUTER_INPUT_GROUP_ID || key === COMPUTER_INPUT_GROUP_HANDLE) {
    return categoryGroup(categories, COMPUTER_INPUT_GROUP_ID, COMPUTER_INPUT_GROUP_HANDLE, 'Mouse & Keyboard',
      new Set(['computer-mobile-accessories-mouse', 'computer-mobile-accessories-keyboards']));
  }
  return undefined;
}

export function isStorefrontCategoryGroup(key: string): boolean {
  return [COOKWARE_GROUP_ID, COOKWARE_GROUP_HANDLE, COMPUTER_INPUT_GROUP_ID, COMPUTER_INPUT_GROUP_HANDLE].includes(key);
}

function categoryGroup(categories: MedusaCategory[], id: string, handle: string, title: string, handles: Set<string>): MedusaCategory {
  const members = new Map<string, MedusaCategory>();
  const visit = (nodes: MedusaCategory[]) => nodes.forEach(node => {
    if (node.handle && handles.has(node.handle)) members.set(node.id, node);
    visit(node.category_children || []);
  });
  visit(categories);
  return {
    id,
    handle,
    name: title,
    title,
    category_children: [...members.values()],
  };
}

type HomeSubcategory = { title: string; image: string; href: string; artworkScale?: number };

export const HOME_SUBCATEGORIES: readonly HomeSubcategory[] = [
  { title: 'Coolers', image: 'cooler.jpeg', href: '/c/home-appliances/home-appliances-air-coolers' },
  { title: 'Non-Stick Cookware', image: 'nonstickcookware.jpeg', href: '/c/non-stick-cookware' },
  { title: 'Irons', image: 'iron.jpeg', href: '/c/home-appliances/home-appliances-iron' },
  { title: 'Pressure Cookers', image: 'cooker.jpeg', href: '/c/kitchen-appliances/kitchen-appliances-pressure-cookers' },
  { title: 'Mixer Grinders & Juicers', image: 'mixergrinderandjuicer.jpeg', href: '/c/kitchen-appliances/kitchen-appliances-mixer-grinders-juicer' },
  { title: 'Mouse & Keyboard', image: 'mouse-keyboard.webp', href: '/c/mouse-keyboard', artworkScale: 0.9 },
  { title: 'Induction & Cooktops', image: 'induction-cooktops.webp', href: '/c/kitchen-appliances/kitchen-appliances-inductions-cooktops', artworkScale: 0.9 },
  { title: 'Kettles', image: 'kettles.webp', href: '/c/home-appliances/home-appliances-kettle', artworkScale: 0.9 },
] as const;
