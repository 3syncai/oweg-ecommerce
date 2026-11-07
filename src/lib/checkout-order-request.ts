export type CheckoutOrderFetchResult<T> = {
  order: T | null;
  notFound: boolean;
  authRequired?: boolean;
  cancelled?: boolean;
  timedOut?: boolean;
};

/** Cleanup cancellation and a slow read are outcomes, not failed order placements. */
export async function fetchCheckoutOrder<T>(
  orderId: string,
  statusOnly: boolean,
  controller: AbortController,
  request: typeof fetch = fetch,
  timeoutMs = 15000,
): Promise<CheckoutOrderFetchResult<T>> {
  const empty = { order: null, notFound: false };
  if (controller.signal.aborted) return { ...empty, cancelled: true };
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await request(`/api/checkout/${statusOnly ? "confirmation-status" : "order-summary"}?orderId=${encodeURIComponent(orderId)}`, {
      cache: "no-store", signal: controller.signal,
    });
    if (response.status === 401) return { ...empty, authRequired: true };
    if (response.status === 404) return { order: null, notFound: true };
    if (!response.ok) return empty;
    const data = await response.json();
    // A custom transport may finish despite cancellation. Discard stale results.
    if (controller.signal.aborted) return { ...empty, cancelled: !timedOut, timedOut };
    return { order: data.order as T, notFound: false };
  } catch (error) {
    if (controller.signal.aborted) return { ...empty, cancelled: !timedOut, timedOut };
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}
