"use client";

import { Toaster } from "sonner";

const AppToaster = () => (
  <Toaster
    position="top-right"
    richColors
    closeButton
    toastOptions={{
      unstyled: false,
      classNames: {
        toast:
          "rounded-xl border border-slate-100 shadow-xl bg-white/95 backdrop-blur px-5 py-4 text-slate-900",
        description: "text-sm text-slate-600",
        actionButton:
          "ml-3 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-100",
      },
    }}
  />
);

export default AppToaster;
