// Small diagnostics log, shown at the bottom of the plugin settings.
export const debug: Record<string, string> = {};

export const note = (key: string, value: string) => {
  debug[key] = value;
  console.log(`[ReadAll] ${key}: ${value}`);
};

const keysOf = (value: any, max: number): string =>
  Object.keys(value).slice(0, max).join(", ");

// Lists the keys of an object and, one level down, the keys of its object values.
export const describe = (value: any): string => {
  if (!value || typeof value !== "object") return String(value);
  const parts = Object.keys(value)
    .slice(0, 14)
    .map((k) => {
      let inner: any;
      try {
        inner = value[k];
      } catch {}
      return inner && typeof inner === "object" && !Array.isArray(inner) ? `${k}{${keysOf(inner, 8)}}` : k;
    });
  return `{${parts.join(", ")}}`;
};
