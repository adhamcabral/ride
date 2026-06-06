export type AdvancedItemType = 'any' | 'folder' | 'pdfs' | 'docs' | 'sheets' | 'slides' | 'images' | 'videos';
export type AdvancedLocation = 'any' | 'drive' | 'shared' | 'folder';
export type AdvancedDatePreset = 'any' | 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

export type AdvancedSearchFilters = {
  itemType: AdvancedItemType;
  ownerId: string;
  content: string;
  itemName: string;
  location: AdvancedLocation;
  locationFolderId: string;
  modifiedPreset: AdvancedDatePreset;
  modifiedAfter: string;
  modifiedBefore: string;
  sharedWith: string;
};

export const defaultAdvancedSearchFilters: AdvancedSearchFilters = {
  itemType: 'any',
  ownerId: 'any',
  content: '',
  itemName: '',
  location: 'any',
  locationFolderId: '',
  modifiedPreset: 'any',
  modifiedAfter: '',
  modifiedBefore: '',
  sharedWith: ''
};

export function hasAdvancedSearchFilters(filters: AdvancedSearchFilters | null) {
  if (!filters) return false;
  return Boolean(
    filters.itemType !== 'any' ||
      filters.ownerId !== 'any' ||
      filters.content.trim() ||
      filters.itemName.trim() ||
      filters.location !== 'any' ||
      filters.modifiedPreset !== 'any' ||
      filters.modifiedAfter ||
      filters.modifiedBefore ||
      filters.sharedWith.trim()
  );
}
