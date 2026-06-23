const SIDE_DOCK_WIDTH_GAP = 160;
const BOTTOM_DOCK_EXTRA_HEIGHT = 120;

let baselineHeightGap = 0;
let baselineWidthGap = 0;
let baselineCalibrated = false;

/** Call once on page load while DevTools is expected to be closed. */
export function calibrateDevToolsBaseline(): void {
  if (typeof window === "undefined" || baselineCalibrated) return;
  baselineHeightGap = window.outerHeight - window.innerHeight;
  baselineWidthGap = window.outerWidth - window.innerWidth;
  baselineCalibrated = true;
}

/** Docked DevTools panel reduces inner viewport vs outer window. */
export function isDevToolsDockedOpen(): boolean {
  if (typeof window === "undefined") return false;

  if (!baselineCalibrated) {
    calibrateDevToolsBaseline();
  }

  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;

  // Side-docked DevTools adds a large width gap (typically 300px+).
  const extraWidth = widthGap - baselineWidthGap;
  if (extraWidth > SIDE_DOCK_WIDTH_GAP) return true;

  // Bottom-docked DevTools grows height beyond normal browser chrome.
  const extraHeight = heightGap - baselineHeightGap;
  if (extraHeight > BOTTOM_DOCK_EXTRA_HEIGHT) return true;

  return false;
}

/** debugger statements pause only while DevTools is open. */
function isDebuggerProbePaused(): boolean {
  const start = performance.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (function () {
      return false;
    })["constructor"]("debugger")();
  } catch {
    return false;
  }
  return performance.now() - start > 100;
}

export function isDevToolsLikelyOpen(): boolean {
  if (typeof window === "undefined") return false;
  if (isDevToolsDockedOpen()) return true;
  return isDebuggerProbePaused();
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
}
