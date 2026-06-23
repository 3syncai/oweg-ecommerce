export type NotificationChannelSettings = {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
};

export type NotificationSettings = {
  orderConfirmation: NotificationChannelSettings;
  shippingUpdates: NotificationChannelSettings;
  deliveryUpdates: NotificationChannelSettings;
  flashSaleAlerts: NotificationChannelSettings;
  discountOffers: NotificationChannelSettings;
  newArrivals: NotificationChannelSettings;
  loginAlerts: NotificationChannelSettings;
  passwordChanges: NotificationChannelSettings;
};

export type RecommendationSettings = {
  personalizedRecommendations: boolean;
  offerAlerts: boolean;
  newArrivals: boolean;
  similarProducts: boolean;
};

export type AccountSettings = {
  notifications: NotificationSettings;
  recommendations: RecommendationSettings;
  lastUpdated?: string;
};

const defaultChannel = (): NotificationChannelSettings => ({
  email: true,
  sms: false,
  whatsapp: true,
});

export const defaultNotificationSettings = (): NotificationSettings => ({
  orderConfirmation: defaultChannel(),
  shippingUpdates: defaultChannel(),
  deliveryUpdates: defaultChannel(),
  flashSaleAlerts: { email: true, sms: false, whatsapp: true },
  discountOffers: { email: true, sms: false, whatsapp: false },
  newArrivals: { email: true, sms: false, whatsapp: false },
  loginAlerts: { email: true, sms: true, whatsapp: false },
  passwordChanges: { email: true, sms: true, whatsapp: false },
});

export const defaultRecommendationSettings = (): RecommendationSettings => ({
  personalizedRecommendations: true,
  offerAlerts: true,
  newArrivals: true,
  similarProducts: true,
});

export const defaultAccountSettings = (): AccountSettings => ({
  notifications: defaultNotificationSettings(),
  recommendations: defaultRecommendationSettings(),
});

function normalizeChannel(value: unknown, fallback: NotificationChannelSettings): NotificationChannelSettings {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    email: typeof record.email === "boolean" ? record.email : fallback.email,
    sms: typeof record.sms === "boolean" ? record.sms : fallback.sms,
    whatsapp: typeof record.whatsapp === "boolean" ? record.whatsapp : fallback.whatsapp,
  };
}

function normalizeNotifications(value: unknown): NotificationSettings {
  const defaults = defaultNotificationSettings();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  return {
    orderConfirmation: normalizeChannel(record.orderConfirmation, defaults.orderConfirmation),
    shippingUpdates: normalizeChannel(record.shippingUpdates, defaults.shippingUpdates),
    deliveryUpdates: normalizeChannel(record.deliveryUpdates, defaults.deliveryUpdates),
    flashSaleAlerts: normalizeChannel(record.flashSaleAlerts, defaults.flashSaleAlerts),
    discountOffers: normalizeChannel(record.discountOffers, defaults.discountOffers),
    newArrivals: normalizeChannel(record.newArrivals, defaults.newArrivals),
    loginAlerts: normalizeChannel(record.loginAlerts, defaults.loginAlerts),
    passwordChanges: normalizeChannel(record.passwordChanges, defaults.passwordChanges),
  };
}

function normalizeRecommendations(value: unknown): RecommendationSettings {
  const defaults = defaultRecommendationSettings();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  return {
    personalizedRecommendations:
      typeof record.personalizedRecommendations === "boolean"
        ? record.personalizedRecommendations
        : defaults.personalizedRecommendations,
    offerAlerts:
      typeof record.offerAlerts === "boolean" ? record.offerAlerts : defaults.offerAlerts,
    newArrivals:
      typeof record.newArrivals === "boolean" ? record.newArrivals : defaults.newArrivals,
    similarProducts:
      typeof record.similarProducts === "boolean" ? record.similarProducts : defaults.similarProducts,
  };
}

export function normalizeAccountSettings(raw: unknown): AccountSettings {
  const defaults = defaultAccountSettings();
  if (!raw || typeof raw !== "object") return defaults;
  const record = raw as Record<string, unknown>;
  const lastUpdated =
    typeof record.lastUpdated === "string" ? record.lastUpdated : undefined;
  return {
    notifications: normalizeNotifications(record.notifications),
    recommendations: normalizeRecommendations(record.recommendations),
    ...(lastUpdated ? { lastUpdated } : {}),
  };
}

export function extractAccountSettings(metadata?: Record<string, unknown> | null): AccountSettings {
  if (!metadata || typeof metadata !== "object") return defaultAccountSettings();
  return normalizeAccountSettings(metadata.account_settings);
}
