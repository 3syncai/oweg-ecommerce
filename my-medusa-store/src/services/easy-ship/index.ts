import { DummyItlProvider } from "./dummy-itl"
import { ItlProvider } from "./itl"
import { ShiprocketEasyShipProvider } from "./shiprocket-adapter"
import {
  getConfiguredEasyShipProviderName,
  getItlMode,
  type EasyShipProvider,
  type EasyShipProviderName,
} from "./types"

export type {
  EasyShipCourier,
  EasyShipCreateResult,
  EasyShipPickupAddress,
  EasyShipProvider,
  EasyShipProviderName,
  EasyShipServiceabilityInput,
} from "./types"

export {
  easyShipDisplayName,
  getConfiguredEasyShipProviderName,
  getItlMode,
} from "./types"

export { forceDummyItlStatus, getDummyShipmentByAwb } from "./dummy-itl"

let cached: { key: string; provider: EasyShipProvider } | null = null

function cacheKey(name: EasyShipProviderName, itlMode: string) {
  return `${name}:${itlMode}`
}

export function getEasyShipProvider(): EasyShipProvider {
  const name = getConfiguredEasyShipProviderName()
  const itlMode = getItlMode()
  const key = cacheKey(name, itlMode)

  if (cached?.key === key) {
    return cached.provider
  }

  let provider: EasyShipProvider
  if (name === "shiprocket") {
    provider = new ShiprocketEasyShipProvider()
  } else if (itlMode === "live") {
    provider = new ItlProvider()
  } else {
    provider = new DummyItlProvider()
  }

  console.log(
    `[EasyShip] Using provider=${provider.name} display=${provider.displayName}` +
      (name === "itl" ? ` mode=${itlMode}` : "")
  )

  cached = { key, provider }
  return provider
}

/** Test helper — clear singleton between env changes. */
export function resetEasyShipProviderCache() {
  cached = null
}
