const SIDE_DOCK_WIDTH_GAP = 200;
const BOTTOM_DOCK_EXTRA_HEIGHT = 160;
const REQUIRED_CONSECUTIVE_POSITIVES = 3;
const REQUIRED_CONSECUTIVE_NEGATIVES = 2;
const VIEWPORT_SETTLE_GRACE_MS = 1500;

let baselineHeightGap = 0;
let baselineWidthGap = 0;
let baselineInnerRatio = 1;
let baselineCalibrated = false;
let consecutivePositives = 0;
let consecutiveNegatives = 0;
let devtoolsBlocked = false;
let graceUntil = 0;

function measureGaps(): { widthGap: number; heightGap: number; innerRatio: number } {
  if (typeof window === "undefined") {
    return { widthGap: 0, heightGap: 0, innerRatio: 1 };
  }

  const innerWidth = window.visualViewport?.width ?? window.innerWidth;
  const innerHeight = window.visualViewport?.height ?? window.innerHeight;
  const outerWidth = window.outerWidth || 1;

  return {
    widthGap: outerWidth - innerWidth,
    heightGap: window.outerHeight - innerHeight,
    innerRatio: innerWidth / outerWidth,
  };
}

/** Call once on page load while DevTools is expected to be closed. */
export function calibrateDevToolsBaseline(): void {
  if (typeof window === "undefined") return;
  const { widthGap, heightGap, innerRatio } = measureGaps();
  baselineHeightGap = heightGap;
  baselineWidthGap = widthGap;
  baselineInnerRatio = innerRatio;
  baselineCalibrated = true;
}

/** Docked DevTools panel reduces inner viewport vs outer window. */
export function isDevToolsDockedOpen(): boolean {
  if (typeof window === "undefined" || !baselineCalibrated) return false;
  if (Date.now() < graceUntil) return false;

  const { widthGap, heightGap, innerRatio } = measureGaps();

  // Browser zoom (150%, 200%, 300%) changes inner/outer ratio — not DevTools.
  if (Math.abs(innerRatio - baselineInnerRatio) > 0.02) return false;

  const extraWidth = widthGap - baselineWidthGap;
  const extraHeight = heightGap - baselineHeightGap;

  if (extraWidth > SIDE_DOCK_WIDTH_GAP) return true;
  if (extraHeight > BOTTOM_DOCK_EXTRA_HEIGHT) return true;

  return false;
}

export function isDevToolsLikelyOpen(): boolean {
  if (typeof window === "undefined") return false;
  return isDevToolsDockedOpen();
}

/**
 * Hysteresis wrapper — avoids false positives from transient resize / zoom / mobile chrome.
 */
export function evaluateDevToolsOpen(): boolean {
  if (Date.now() < graceUntil) {
    return false;
  }

  const raw = isDevToolsLikelyOpen();

  if (raw) {
    consecutiveNegatives = 0;
    consecutivePositives += 1;
  } else {
    consecutivePositives = 0;
    consecutiveNegatives += 1;
  }

  if (!devtoolsBlocked && consecutivePositives >= REQUIRED_CONSECUTIVE_POSITIVES) {
    devtoolsBlocked = true;
  } else if (devtoolsBlocked && consecutiveNegatives >= REQUIRED_CONSECUTIVE_NEGATIVES) {
    devtoolsBlocked = false;
  }

  return devtoolsBlocked;
}

/**
 * Reset detection state and recalibrate after resize, zoom, or orientation change.
 * Always runs — even if a false positive already blocked the page.
 */
export function handleViewportSettled(): void {
  devtoolsBlocked = false;
  consecutivePositives = 0;
  consecutiveNegatives = 0;
  graceUntil = Date.now() + VIEWPORT_SETTLE_GRACE_MS;
  resetDevToolsBaseline();
  calibrateDevToolsBaseline();
}

/** Cancel in-flight positive counts while viewport is still changing. */
export function handleViewportChanging(): void {
  consecutivePositives = 0;
}

export function isDevToolsShortcut(event: KeyboardEvent): boolean {
  if (!event.key) return false;
  const key = event.key.toLowerCase();

  if (key === "f12") return true;

  const inspectKeys = ["i", "j", "c", "k", "u"];
  if (event.ctrlKey && event.shiftKey && inspectKeys.includes(key)) return true;
  if (event.metaKey && event.altKey && inspectKeys.includes(key)) return true;
  if (event.metaKey && event.altKey && key === "u") return true;
  if (event.ctrlKey && key === "u") return true;

  return false;
}

export function resetDevToolsBaseline(): void {
  baselineCalibrated = false;
  baselineHeightGap = 0;
  baselineWidthGap = 0;
  baselineInnerRatio = 1;
}

export function resetDevToolsMonitor(): void {
  resetDevToolsBaseline();
  consecutivePositives = 0;
  consecutiveNegatives = 0;
  devtoolsBlocked = false;
  graceUntil = 0;
}
