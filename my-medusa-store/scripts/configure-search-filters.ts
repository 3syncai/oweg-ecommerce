import { getMeiliClient, waitForMeiliTask } from '../src/utils/meilisearch'
import { getProductsIndexUid } from '../src/utils/search-index'

/** Settings-only rollout: no index deletion, document replacement or product writes. */
export default async function configureSearchFilters() {
  const index = getMeiliClient().index(getProductsIndexUid())
  const settings = await index.getSettings()
  const filterableAttributes = Array.from(new Set([...(settings.filterableAttributes || []), 'price', 'brand', 'rating']))
  const sortableAttributes = Array.from(new Set([...(settings.sortableAttributes || []), 'price']))
  const rankingRules = ['sort', ...(settings.rankingRules as string[]).filter(rule => rule !== 'sort')]
  const task = await index.updateSettings({ filterableAttributes, sortableAttributes, rankingRules })
  await waitForMeiliTask(getMeiliClient(), task.taskUid)
  console.log('Search filters and price sorting ready; indexed documents unchanged.')
}
