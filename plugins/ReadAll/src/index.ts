import { after, before } from "@vendetta/patcher";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import ReadButton, { FOOTER_EXTRA } from "./ReadButton";
import Settings from "./Settings";

let unpatchers: (() => void)[] = [];
let retryTimer: ReturnType<typeof setInterval> | undefined;
const patched = new WeakSet<object>();

// Refs returned by the guild bar hook. The list element that uses one of them is the guild bar list.
const guildsBarRefs = new Set<any>();

// Discord has renamed this hook before, so match any guild bar style hook.
const HOOK = /^use\w*guild\w*(bar|list|rail|nav)/i;

// Adds the Read All button below the native buttons in the guild bar footer.
// Takes either the hook's return value (older Discord) or the list's props.
function patchFooter(target: any) {
  const props = target?.listDataProps ?? (target?.footerSize && target?.renderFooter ? target : undefined);
  if (!props || patched.has(props)) return;
  if (typeof props.footerSize !== "function" || typeof props.renderFooter !== "function") return;

  const { footerSize, renderFooter } = props;
  try {
    props.footerSize = () => footerSize.call(props) + FOOTER_EXTRA;
    props.renderFooter = () =>
      React.createElement(
        RN.View,
        { style: { alignSelf: "stretch" }, collapsable: false },
        renderFooter.call(props),
        React.createElement(ReadButton)
      );
    patched.add(props);
  } catch {}
}

// Runs for every element Discord creates, but only touches the guild bar list (matched by ref).
function patchElementCreation() {
  const runtime = findByProps("jsx", "jsxs");
  const targets: [string, any][] = [["jsx", runtime], ["jsxs", runtime], ["createElement", React]];

  for (const [name, obj] of targets) {
    if (typeof obj?.[name] !== "function") continue;
    try {
      unpatchers.push(
        before(name, obj, (args: any[]) => {
          const props = args?.[1];
          if (props?.ref && guildsBarRefs.has(props.ref)) patchFooter(props);
        })
      );
    } catch {}
  }
}

// Finds the already-loaded guild bar hook and patches it. Returns how many were patched.
function patchGuildsBar(): number {
  const modules = (globalThis as any).modules;
  let count = 0;

  for (const id in modules) {
    const exports = modules[id]?.isInitialized && modules[id].publicModule?.exports;
    if (!exports) continue;

    for (const key of new Set(["default", ...Object.keys(exports)])) {
      // Only read values for "default" or hook-like names, to avoid touching lazy getters.
      let fn: any;
      try {
        fn = key === "default" || HOOK.test(key) ? exports[key] : undefined;
      } catch {
        continue;
      }
      if (typeof fn !== "function" || !HOOK.test(fn.name || key)) continue;

      try {
        unpatchers.push(
          after(key, exports, (_args: any[], ret: any) => {
            if (ret?.fastListRef) guildsBarRefs.add(ret.fastListRef);
            if (ret?.scrollerRef && typeof ret.scrollerRef === "object") guildsBarRefs.add(ret.scrollerRef);
            patchFooter(ret);
          })
        );
        count++;
      } catch {}
    }
  }
  return count;
}

export default {
  onLoad() {
    patchElementCreation();
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
    guildsBarRefs.clear();
  },

  settings: Settings
};
