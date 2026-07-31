import HomePage from './home/HomePage';
import { buildHomeFeedCached } from '@/lib/home-feed';

export default async function Page() {
  let feed;
  try {
    ({ feed } = await buildHomeFeedCached());
  } catch {
    feed = undefined;
  }

  return <HomePage initialFeed={feed} />;
}
