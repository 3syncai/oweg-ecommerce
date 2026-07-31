import HomePage from './home/HomePage';
import { buildHomeFeedCached } from '@/lib/home-feed';

export default async function Page() {
  const { feed } = await buildHomeFeedCached().catch(() => ({
    feed: {
      sections: [],
      spotlight: null,
      popular: null,
      meta: { categoriesTried: 0, categoriesWithProducts: 0, totalProducts: 0 },
    },
  }));

  return <HomePage initialFeed={feed} />;
}
