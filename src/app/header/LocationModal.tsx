// src/app/header/LocationModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MapPin, X, Loader2, Navigation, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getUserGeolocation,
  reverseGeocode,
  fetchLocationByPincode,
  saveLocation,
  isValidPincode,
  type LocationData,
} from "./locationUtils";

type LocationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: LocationData) => void;
  currentLocation?: LocationData | null;
};

export default function LocationModal({
  isOpen,
  onClose,
  currentLocation,
  onLocationSelect,
}: LocationModalProps) {
  const [step, setStep] = useState<"choose" | "pincode" | "detecting">(
    "choose"
  );
  const [pincode, setPincode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("choose");
      setPincode("");
      setError("");
    }
  }, [isOpen]);

  const handleDetectLocation = async () => {
    setStep("detecting");
    setError("");
    setLoading(true);

    try {
      const position = await getUserGeolocation();
      const { latitude, longitude } = position.coords;
      const location = await reverseGeocode(latitude, longitude);

      if (location) {
        saveLocation(location);
        onLocationSelect(location);
        onClose();
      } else {
        setError(
          "Unable to determine your location. Please enter pincode manually."
        );
        setStep("pincode");
      }
    } catch (err) {
      console.error("Geolocation error:", err);

      // Type guard for GeolocationPositionError
      if (err && typeof err === "object" && "code" in err) {
        const geoError = err as GeolocationPositionError;
        if (geoError.code === 1) {
          setError(
            "Location access denied. Please enter your pincode manually."
          );
        } else if (geoError.code === 2) {
          setError("Location unavailable. Please enter your pincode manually.");
        } else if (geoError.code === 3) {
          setError(
            "Location request timeout. Please enter your pincode manually."
          );
        } else {
          setError(
            "Failed to detect location. Please enter your pincode manually."
          );
        }
      } else {
        setError(
          "Failed to detect location. Please enter your pincode manually."
        );
      }

      setStep("pincode");
    } finally {
      setLoading(false);
    }
  };

  const handlePincodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValidPincode(pincode)) {
      setError("Please enter a valid 6-digit pincode");
      return;
    }

    setLoading(true);

    try {
      const location = await fetchLocationByPincode(pincode);

      if (location) {
        saveLocation(location);
        onLocationSelect(location);
        onClose();
      } else {
        setError("Unable to find location for this pincode. Please try again.");
      }
    } catch (error) {
      console.error("Pincode lookup error:", error);
      setError("Failed to fetch location. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[#7AC943]">
            <MapPin className="h-6 w-6" />
            <h2 className="text-xl font-semibold">Choose your location</h2>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Select a delivery location to see product availability and delivery
            options
          </p>
        </div>

        {/* Current location display */}
        {currentLocation && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm">
            <p className="font-medium text-green-800">Current location:</p>
            <p className="text-green-700">
              {currentLocation.city}, {currentLocation.state} -{" "}
              {currentLocation.pincode}
            </p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Step: Choose method */}
        {step === "choose" && (
          <div className="space-y-3">
            <Button
              onClick={handleDetectLocation}
              className="w-full bg-[#7AC943] hover:bg-[#6AB833] text-white"
              disabled={loading}
            >
              <Navigation className="mr-2 h-4 w-4" />
              Detect my location
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">or</span>
              </div>
            </div>

            <Button
              onClick={() => setStep("pincode")}
              variant="outline"
              className="w-full"
            >
              <Search className="mr-2 h-4 w-4" />
              Enter pincode manually
            </Button>
          </div>
        )}

        {/* Step: Detecting */}
        {step === "detecting" && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-[#7AC943]" />
            <p className="mt-4 text-sm text-gray-600">
              Detecting your location...
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Please allow location access when prompted
            </p>
          </div>
        )}

        {/* Step: Enter pincode */}
        {step === "pincode" && (
          <form onSubmit={handlePincodeSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="pincode"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Enter your pincode
              </label>
              <Input
                id="pincode"
                type="text"
                placeholder="e.g., 560034"
                value={pincode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPincode(value);
                  setError("");
                }}
                maxLength={6}
                className="text-lg"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter a 6-digit Indian pincode
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("choose")}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={loading || pincode.length !== 6}
                className="flex-1 bg-[#7AC943] hover:bg-[#6AB833] text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Apply"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
