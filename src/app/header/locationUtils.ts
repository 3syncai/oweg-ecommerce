// src/app/header/locationUtils.ts

export type LocationData = {
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
};

const LOCATION_STORAGE_KEY = "oweg_user_location";

/**
 * Get user's location using browser Geolocation API
 */
export async function getUserGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Reverse geocode coordinates to get address
 * Using OpenStreetMap Nominatim (free)
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<LocationData | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?` +
        `format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "OWEG-App",
        },
      }
    );

    if (!response.ok) throw new Error("Geocoding failed");

    const data = await response.json();
    const address = data.address || {};

    const city =
      address.city ||
      address.town ||
      address.village ||
      address.suburb ||
      address.county ||
      "Unknown";
    const state = address.state || "Unknown";
    const pincode = address.postcode || "";

    return {
      city,
      state,
      pincode,
      latitude,
      longitude,
    };
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

/**
 * Fetch location details by pincode
 * Using India Post API
 */
export async function fetchLocationByPincode(
  pincode: string
): Promise<LocationData | null> {
  try {
    const cleanPincode = pincode.replace(/\D/g, "");
    if (cleanPincode.length !== 6) {
      throw new Error("Invalid pincode");
    }

    const response = await fetch(
      `https://api.postalpincode.in/pincode/${cleanPincode}`
    );

    if (!response.ok) throw new Error("Pincode lookup failed");

    const data = await response.json();

    if (data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
      const postOffice = data[0].PostOffice[0];
      return {
        city: postOffice.District || postOffice.Name || "Unknown",
        state: postOffice.State || "Unknown",
        pincode: cleanPincode,
      };
    }

    return null;
  } catch (error) {
    console.error("Pincode lookup error:", error);
    return null;
  }
}

/**
 * Save location to localStorage
 */
export function saveLocation(location: LocationData): void {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  } catch (error) {
    console.error("Failed to save location:", error);
  }
}

/**
 * Get saved location from localStorage
 */
export function getSavedLocation(): LocationData | null {
  try {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error("Failed to get saved location:", error);
    return null;
  }
}

/**
 * Clear saved location
 */
export function clearLocation(): void {
  try {
    localStorage.removeItem(LOCATION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear location:", error);
  }
}

/**
 * Validate Indian pincode
 */
export function isValidPincode(pincode: string): boolean {
  const cleaned = pincode.replace(/\D/g, "");
  return /^[1-9][0-9]{5}$/.test(cleaned);
}
