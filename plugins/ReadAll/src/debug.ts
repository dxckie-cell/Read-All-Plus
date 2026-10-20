// Small diagnostics log, shown at the bottom of the plugin settings.
export const debug: Record<string, string> = {};

export const note = (key: string, value: string) => {
  debug[key] = value;
  console.log(`[ReadAll] ${key}: ${value}`);
};

export const describe = (value: any): string =>
  value && typeof value === "object" ? `{${Object.keys(value).slice(0, 14).join(", ")}}` : String(value);
