"use client";

import { useDebugControllerSettings } from "./DebugControllerProvider";
import FloatingWhatsAppWidget from "@/components/common/FloatingWhatsAppWidget";

export default function ConditionalWhatsAppWidget() {
  const settings = useDebugControllerSettings();

  if (!settings.enableWhatsAppWidget) {
    return null;
  }

  return <FloatingWhatsAppWidget />;
}
