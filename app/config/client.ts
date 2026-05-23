import { BuildConfig, getBuildConfig } from "./build";

export function getClientConfig() {
  if (typeof document !== "undefined") {
    // client side
    const rawConfig = queryMeta("config");

    if (!rawConfig) {
      console.warn("[Client Config] missing config meta, using defaults.");
      return {} as BuildConfig;
    }

    try {
      return JSON.parse(rawConfig) as BuildConfig;
    } catch (e) {
      console.warn("[Client Config] failed to parse config meta", e);
      return {} as BuildConfig;
    }
  }

  if (typeof process !== "undefined") {
    // server side
    return getBuildConfig();
  }
}

function queryMeta(key: string, defaultValue?: string): string {
  let ret: string;
  if (document) {
    const meta = document.head.querySelector(
      `meta[name='${key}']`,
    ) as HTMLMetaElement;
    ret = meta?.content ?? "";
  } else {
    ret = defaultValue ?? "";
  }

  return ret;
}
