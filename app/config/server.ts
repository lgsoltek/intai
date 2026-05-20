import md5 from "spark-md5";
import { DEFAULT_MODELS } from "../constant";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PROXY_URL?: string; // docker only

      OPENAI_API_KEY?: string;
      CODE?: string;

      BASE_URL?: string;
      OPENAI_ORG_ID?: string; // openai only

      VERCEL?: string;
      BUILD_MODE?: "standalone" | "export";
      BUILD_APP?: string; // is building desktop app

      HIDE_USER_API_KEY?: string; // disable user's api key input
      DISABLE_GPT4?: string; // allow user to use gpt-4 or not
      ENABLE_BALANCE_QUERY?: string; // allow user to query balance or not
      DISABLE_FAST_LINK?: string; // disallow parse settings from url or not
      CUSTOM_MODELS?: string; // to control custom models
      DEFAULT_MODEL?: string; // to control default model in every new chat window
      ENABLE_MODEL_SELECTOR?: string; // allow users to choose from available models
      PROVIDERS?: string; // comma-separated provider ids
      SUMMARY_PROVIDER?: string; // optional provider id for title/history summary
      SUMMARY_MODEL?: string; // optional model for title/history summary
      SUMMARY_MODELS?: string; // optional provider:model pairs for title/history summary
      MODEL_CATALOG_PASSWORD?: string; // optional password for live provider model catalog

      // google tag manager
      GTM_ID?: string;

      // custom template for preprocessing user input
      DEFAULT_INPUT_TEMPLATE?: string;
      NEXT_PUBLIC_SYSTEM_PROMPT?: string;
    }
  }
}

const ACCESS_CODES = (function getAccessCodes(): Set<string> {
  const code = process.env.CODE;

  try {
    const codes = (code?.split(",") ?? [])
      .filter((v) => !!v)
      .map((v) => md5.hash(v.trim()));
    return new Set(codes);
  } catch (e) {
    return new Set();
  }
})();

function getApiKey(keys?: string) {
  const apiKeyEnvVar = keys ?? "";
  const apiKeys = apiKeyEnvVar.split(",").map((v) => v.trim());
  const randomIndex = Math.floor(Math.random() * apiKeys.length);
  const apiKey = apiKeys[randomIndex];
  if (apiKey) {
    console.log(
      `[Server Config] using ${randomIndex + 1} of ${apiKeys.length} api key`,
    );
  }

  return apiKey;
}

export type ServerProviderModel = {
  model: string;
  displayName: string;
};

export type ServerProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ServerProviderModel[];
};

function envKey(providerId: string, name: string) {
  return `PROVIDER_${providerId
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")}_${name}`;
}

function parseProviderModels(models = ""): ServerProviderModel[] {
  return models
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && value !== "-all")
    .filter((value) => !value.startsWith("-"))
    .map((value) => {
      const normalized = value.startsWith("+") ? value.slice(1) : value;
      const [model, displayName] = normalized.split("=");
      return {
        model,
        displayName: displayName || model,
      };
    });
}

function getProviderConfigs(): ServerProviderConfig[] {
  const providerIds = (process.env.PROVIDERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (providerIds.length === 0) {
    return [];
  }

  return providerIds
    .map((id) => {
      const name = process.env[envKey(id, "NAME")] || id;
      const baseUrl = process.env[envKey(id, "BASE_URL")] || "";
      const apiKeys = process.env[envKey(id, "API_KEY")] || "";
      const modelConfig = process.env[envKey(id, "MODELS")] || "";

      return {
        id,
        name,
        baseUrl,
        apiKey: getApiKey(apiKeys),
        models: parseProviderModels(modelConfig),
      };
    })
    .filter((provider) => provider.baseUrl && provider.apiKey);
}

function getSafeProviderModels(providers: ServerProviderConfig[]) {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      name: model.model,
      displayName: model.displayName,
      available: true,
      provider: {
        id: provider.id,
        providerName: provider.name,
        providerType: "openai",
      },
    })),
  );
}

export const getServerSideConfig = () => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }

  const disableGPT4 = !!process.env.DISABLE_GPT4;
  let customModels = process.env.CUSTOM_MODELS ?? "";
  let defaultModel = process.env.DEFAULT_MODEL ?? "";

  if (disableGPT4) {
    if (customModels) customModels += ",";
    customModels += DEFAULT_MODELS.filter((m) => m.name.startsWith("gpt-4"))
      .map((m) => "-" + m.name)
      .join(",");
    if (defaultModel.startsWith("gpt-4")) defaultModel = "";
  }

  const allowedWebDevEndpoints = (
    process.env.WHITE_WEBDEV_ENDPOINTS ?? ""
  ).split(",");
  const providers = getProviderConfigs();

  return {
    baseUrl: process.env.BASE_URL,
    apiKey: getApiKey(process.env.OPENAI_API_KEY),
    openaiOrgId: process.env.OPENAI_ORG_ID,

    gtmId: process.env.GTM_ID,

    needCode: ACCESS_CODES.size > 0,
    code: process.env.CODE,
    codes: ACCESS_CODES,

    proxyUrl: process.env.PROXY_URL,
    isVercel: !!process.env.VERCEL,

    hideUserApiKey: !!process.env.HIDE_USER_API_KEY,
    disableGPT4,
    hideBalanceQuery: !process.env.ENABLE_BALANCE_QUERY,
    disableFastLink: !!process.env.DISABLE_FAST_LINK,
    customModels,
    defaultModel,
    enableModelSelector: !!process.env.ENABLE_MODEL_SELECTOR,
    allowedWebDevEndpoints,
    providers,
    providerModels: getSafeProviderModels(providers),
    summaryProvider: process.env.SUMMARY_PROVIDER,
    summaryModel: process.env.SUMMARY_MODEL,
    summaryModels: process.env.SUMMARY_MODELS,
    modelCatalogPassword: process.env.MODEL_CATALOG_PASSWORD,
  };
};
