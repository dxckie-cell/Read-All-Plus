import { after } from "@vendetta/patcher";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import ReadButton, { FOOTER_EXTRA } from "./ReadButton";
import Settings from "./Settings";
import { note, describe } from "./debug";

let unpatchers: (() => void)[] = [];
let retryTimer: ReturnType<typeof setInterval> | undefined;
const patched = new WeakSet<object>();
const reported = new Set<string>();

// Discord has renamed and split this hook before, so match any guild bar/list style hook.
const HOOK = /^use\w*guild\w*(bar|list|rail|nav)/i;
const GUILD_UI = /guild.*(bar|list|rail|nav)|(bar|list|rail|nav).*guild/i;
const FAST_LIST = /fastlist/i;

// Adds the Read All button below the native buttons in the guild bar footer.
function patchFooter(ret: any) {
  // The footer props are either nested in listDataProps or returned directly.
  const ldp = ret?.listDataProps ?? (ret?.footerSize && ret?.renderFooter ? ret : undefined);
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
  note("footer", "button added");
}

// Finds the already-loaded guild bar hook and patches it. Returns how many were patched.
function patchGuildsBar(): number {
  const modules = (globalThis as any).modules;
  const similar = new Set<string>();
  const lists = new Set<string>();
  let count = 0;

  for (const id in modules) {
    const exports = modules[id]?.isInitialized && modules[id].publicModule?.exports;
    if (!exports) continue;

    for (const key of new Set(["default", ...Object.keys(exports)])) {
      // Only read values for "default" or names that look right, to avoid touching lazy getters.
      let fn: any;
      try {
        fn = key === "default" || HOOK.test(key) ? exports[key] : undefined;
      } catch {
        continue;
      }
      const name: string = typeof fn === "function" ? fn.name || key : "";
      if (GUILD_UI.test(key) || GUILD_UI.test(name)) similar.add(name || key);
      if (FAST_LIST.test(key) || FAST_LIST.test(name)) lists.add(name || key);
      if (!HOOK.test(name)) continue;

      const label = `hook ${id}:${key} (${name})`;
      try {
        unpatchers.push(
          after(key, exports, (_args: any[], ret: any) => {
            if (!reported.has(label) && reported.size < 12) {
              reported.add(label);
              note(label, `returns ${describe(ret)}`);
            }
            patchFooter(ret);
          })
        );
        count++;
      } catch (e) {
        note(label, `could not patch: ${e}`);
      }
    }
  }

  if (similar.size) note("guild bar/list names", [...similar].slice(0, 40).join(", "));
  if (lists.size) note("fast list names", [...lists].slice(0, 20).join(", "));
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
    reported.clear();
  },

  settings: Settings
};
