"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ACTION_STATUS_EVENT } from "@/lib/notifications";
import styles from "./app-toaster.module.css";

export default function AppToaster() {
  const [status, setStatus] = useState({ message: "", version: 0 });
  useEffect(() => {
    const announce = (event: Event) => setStatus(current => ({ message: (event as CustomEvent<string>).detail, version: current.version + 1 }));
    window.addEventListener(ACTION_STATUS_EVENT, announce);
    return () => window.removeEventListener(ACTION_STATUS_EVENT, announce);
  }, []);
  return <>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={status.version}>{status.message}</span></div>
    <Toaster
      position="bottom-right"
      className={styles.toaster}
      theme="light"
      closeButton
      visibleToasts={1}
      expand={false}
      duration={4500}
      offset={24}
      mobileOffset={{ bottom: "calc(85px + env(safe-area-inset-bottom, 0px))", left: 12, right: 12 }}
      pauseWhenPageIsHidden
      containerAriaLabel="Shopping updates"
      toastOptions={{ classNames: { toast: styles.toast, content: styles.content, title: styles.title, description: styles.description, actionButton: styles.action, closeButton: styles.close } }}
    />
  </>;
}
