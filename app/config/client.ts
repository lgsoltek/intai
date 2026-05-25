import { BuildConfig, getBuildConfig } from "./build";

export function getClientConfig() {
  if (typeof document !== "undefined") {
    // client side
    const serializedConfig = queryMeta("config");
    if (!serializedConfig.trim()) return;

    try {
      return JSON.parse(serializedConfig) as BuildConfig;
    } catch (error) {
      console.error("[Config] could not parse embedded client config", error);
      return;
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
