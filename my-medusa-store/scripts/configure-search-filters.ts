import { getMeiliClient, waitForMeiliTask } from '../src/utils/meilisearch'
import { getProductsIndexUid } from '../src/utils/search-index'

/** Settings-only rollout: no index deletion, document replacement or product writes. */
export default async function configureSearchFilters() {
  const index = getMeiliClient().index(getProductsIndexUid())
  const settings = await index.getSettings()
  const filterableAttributes = Array.from(new Set([...(settings.filterableAttributes || []), 'price', 'brand', 'rating']))
  const task = await index.updateSettings({ filterableAttributes })
  await waitForMeiliTask(getMeiliClient(), task.taskUid)
  console.log('Search price, brand and rating filters ready; indexed documents unchanged.')
}
