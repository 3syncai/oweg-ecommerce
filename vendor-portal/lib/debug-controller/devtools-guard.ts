const SIDE_DOCK_WIDTH_GAP = 160;
const BOTTOM_DOCK_EXTRA_HEIGHT = 120;

let baselineHeightGap = 0;
let baselineWidthGap = 0;
let baselineCalibrated = false;

export function calibrateDevToolsBaseline(): void {
  if (typeof window === "undefined" || baselineCalibrated) return;
  baselineHeightGap = window.outerHeight - window.innerHeight;
  baselineWidthGap = window.outerWidth - window.innerWidth;
  baselineCalibrated = true;
}

export function isDevToolsDockedOpen(): boolean {
  if (typeof window === "undefined") return false;

  if (!baselineCalibrated) {
    calibrateDevToolsBaseline();
  }

  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  const extraWidth = widthGap - baselineWidthGap;
  if (extraWidth > SIDE_DOCK_WIDTH_GAP) return true;

  const extraHeight = heightGap - baselineHeightGap;
  if (extraHeight > BOTTOM_DOCK_EXTRA_HEIGHT) return true;

  return false;
}

function isDebuggerProbePaused(): boolean {
  const start = performance.now();
  try {
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
  const key = event.key.toLowerCase();

  if (key === "f12") return true;

  const inspectKeys = ["i", "j", "c", "k", "u", "s"];
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
