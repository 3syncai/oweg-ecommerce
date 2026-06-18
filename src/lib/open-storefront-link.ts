type OpenStorefrontLinkOptions = {
  newTab?: boolean;
};

export function toAbsoluteStorefrontUrl(path: string): string {
  if (typeof window === "undefined") return path;
  if (!path || path === "#") return path;

  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function openViaAnchor(absoluteUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = absoluteUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer external";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/** Always opens the system browser tab, including from an installed desktop PWA. */
export function openStorefrontLinkInNewTab(url: string): void {
  const absoluteUrl = toAbsoluteStorefrontUrl(url);
  if (!absoluteUrl || absoluteUrl === "#") return;

  // Use a native anchor click (not window.open) so desktop PWAs prefer the browser.
  openViaAnchor(absoluteUrl);
}

export function openStorefrontLink(
  url: string,
  options: OpenStorefrontLinkOptions = {}
): void {
  const absoluteUrl = toAbsoluteStorefrontUrl(url);
  if (!absoluteUrl || absoluteUrl === "#") return;

  if (options.newTab) {
    openStorefrontLinkInNewTab(url);
    return;
  }

  window.location.assign(absoluteUrl);
}
