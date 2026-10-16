import { after } from "@vendetta/patcher";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import ReadButton, { FOOTER_EXTRA } from "./ReadButton";
import Settings from "./Settings";

let unpatchers: (() => void)[] = [];
let retryTimer: ReturnType<typeof setInterval> | undefined;
const patched = new WeakSet<object>();

// Adds the Read All button below the native buttons in the guild bar footer.
function patchFooter(ret: any) {
  const ldp = ret?.listDataProps;
  if (!ldp || patched.has(ldp)) return;
  if (typeof ldp.footerSize !== "function" || typeof ldp.renderFooter !== "function") return;

  const { footerSize, renderFooter } = ldp;
  ldp.footerSize = () => footerSize.call(ldp) + FOOTER_EXTRA;
  ldp.renderFooter = () =>
    React.createElement(
      RN.View,
      { style: { alignSelf: "stretch" }, collapsable: false },
      renderFooter.call(ldp),
      React.createElement(ReadButton)
    );

  patched.add(ldp);
}

// Finds the already-loaded guild bar hook and patches it. Returns how many were patched.
function patchGuildsBar(): number {
  const modules = (globalThis as any).modules;
  let count = 0;

  for (const id in modules) {
    const exports = modules[id]?.isInitialized && modules[id].publicModule?.exports;
    if (typeof exports?.default !== "function" || exports.default.name !== "useGuildsBarProps") continue;

    try {
      unpatchers.push(after("default", exports, (_args: any[], ret: any) => patchFooter(ret)));
      count++;
    } catch (e) {
      console.log("[ReadAll]", `Failed to patch module ${id}:`, e);
    }
  }
  return count;
}

export default {
  onLoad() {
    if (patchGuildsBar() > 0) return;

    // The guild bar module may not be loaded yet, so keep trying for up to 30s.
    let tries = 0;
    retryTimer = setInterval(() => {
      if (patchGuildsBar() > 0 || ++tries >= 30) {
        clearInterval(retryTimer);
        retryTimer = undefined;
      }
    }, 1000);
  },

  onUnload() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = undefined;
    unpatchers.forEach((u) => u());
    unpatchers = [];
  },

  settings: Settings
};
