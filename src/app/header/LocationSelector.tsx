// src/app/header/LocationSelector.tsx
"use client";

import React from "react";
import { MapPin, ChevronDown } from "lucide-react";
import type { LocationData } from "./locationUtils";

type LocationSelectorProps = {
  location: LocationData | null;
  onClick: () => void;
};

export default function LocationSelector({
  location,
  onClick,
}: LocationSelectorProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm hover:bg-gray-100 px-3 py-1.5 rounded-md transition-colors"
    >
      <MapPin className="h-4 w-4 text-gray-600" />
      <div className="text-left">
        <div className="text-xs text-gray-500">Deliver to</div>
        <div className="font-medium text-gray-900 flex items-center gap-1">
          {location ? (
            <>
              {location.city} {location.pincode}
              <ChevronDown className="h-3 w-3" />
            </>
          ) : (
            <>
              Select location
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </div>
      </div>
    </button>
  );
}
