import type { Metadata } from "next";
import DebugControllerDashboard from "./DebugControllerDashboard";

export const metadata: Metadata = {
  title: "Debug Controller",
  robots: { index: false, follow: false },
};

export default function DebugControllerPage() {
  return <DebugControllerDashboard />;
}
