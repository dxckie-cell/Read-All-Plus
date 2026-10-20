import { after, before } from "@vendetta/patcher";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import ReadButton, { FOOTER_EXTRA } from "./ReadButton";
import Settings from "./Settings";
import { note, describe } from "./debug";

let unpatchers: (() => void)[] = [];
let retryTimer: ReturnType<typeof setInterval> | undefined;
const patched = new WeakSet<object>();
const reported = new Set<string>();

// Refs handed out by the guild bar hook; the list element that uses one of them is the guild bar list.
const guildsBarRefs = new Set<any>();

// Discord has renamed and split this hook before, so match any guild bar style hook.
const HOOK = /^use\w*guild\w*(bar|list|rail|nav)/i;
const GUILDS_BAR = /guilds?bar/i;
const FAST_LIST = /fastlist/i;

// Adds the Read All button below the native buttons in the guild bar footer.
// Works on either the hook's return value or the list's props.
function patchFooter(ret: any) {
  // The footer props are either nested in listDataProps or on the object itself.
  const ldp = ret?.listDataProps ?? (ret?.footerSize && ret?.renderFooter ? ret : undefined);
  if (!ldp || patched.has(ldp)) return;
  if (typeof ldp.footerSize !== "function" || typeof ldp.renderFooter !== "function") return;

  const { footerSize, renderFooter } = ldp;
  try {
    ldp.footerSize = () => footerSize.call(ldp) + FOOTER_EXTRA;
    ldp.renderFooter = () =>
      React.createElement(
        RN.View,
        { style: { alignSelf: "stretch" }, collapsable: false },
        renderFooter.call(ldp),
        React.createElement(ReadButton)
      );
  } catch (e) {
    return note("footer", `could not modify props: ${e}`);
  }

  patched.add(ldp);
  note("footer", "button added");
}

// Called for every element Discord creates. Only the guild bar list (matched by ref) is touched.
function interceptElement(args: any[]) {
  const props = args?.[1];
  const ref = props?.ref;
  if (!ref || !guildsBarRefs.has(ref) || patched.has(props)) return;

  if (!reported.has("element")) {
    reported.add("element");
    const type = args[0];
    const typeName = type?.displayName || type?.name || type?.render?.name || type?.type?.name || typeof type;
    note("guild bar list element", `${typeName} ${describe(props)}`);
  }
  patchFooter(props);
}

function patchElementCreation() {
  const runtime = findByProps("jsx", "jsxs");
  const targets: [string, any][] = [
    ["jsx", runtime],
    ["jsxs", runtime],
    ["createElement", React]
  ];
  for (const [name, obj] of targets) {
    if (typeof obj?.[name] !== "function") continue;
    try {
      unpatchers.push(before(name, obj, (args: any[]) => void interceptElement(args)));
    } catch (e) {
      note(`element patch ${name}`, `failed: ${e}`);
    }
  }
}

// Patches one hook. Kept out of the scan loop so each hook keeps its own label.
function patchHook(exports: any, key: string, label: string) {
  unpatchers.push(
    after(key, exports, (_args: any[], ret: any) => {
      if (ret?.fastListRef) guildsBarRefs.add(ret.fastListRef);
      if (ret?.scrollerRef && typeof ret.scrollerRef === "object") guildsBarRefs.add(ret.scrollerRef);

      if (!reported.has(label) && reported.size < 12) {
        reported.add(label);
        note(label, `returns ${describe(ret)}`);
      }
      patchFooter(ret);
    })
  );
}

// Finds the already-loaded guild bar hook and patches it. Returns how many were patched.
function patchGuildsBar(): number {
  const modules = (globalThis as any).modules;
  const names = new Set<string>();
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
      if (GUILDS_BAR.test(key) || GUILDS_BAR.test(name)) names.add(name || key);
      if (FAST_LIST.test(key) || FAST_LIST.test(name)) lists.add(name || key);
      if (!HOOK.test(name)) continue;

      try {
        patchHook(exports, key, `hook ${id}:${key} (${name})`);
        count++;
      } catch (e) {
        note(`hook ${id}:${key}`, `could not patch: ${e}`);
      }
    }
  }

  if (names.size) note("guild bar names", [...names].slice(0, 60).join(", "));
  if (lists.size) note("fast list names", [...lists].slice(0, 20).join(", "));
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
    reported.clear();
  },

  settings: Settings
};
