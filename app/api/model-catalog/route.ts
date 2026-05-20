import { NextRequest, NextResponse } from "next/server";

import { getServerSideConfig } from "../../config/server";

function normalizeBaseUrl(baseUrl: string) {
  let normalized = baseUrl;
  if (!normalized.startsWith("http")) {
    normalized = `https://${normalized}`;
  }
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function modelsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1")
    ? `${normalized}/models`
    : `${normalized}/v1/models`;
}

async function fetchProviderModels(provider: {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}) {
  const response = await fetch(modelsUrl(provider.baseUrl), {
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      error: `${response.status} ${response.statusText}`,
      models: [],
    };
  }

  const json = await response.json();
  const models = ((json.data ?? []) as Array<{ id?: string; name?: string }>)
    .map((model) => model.id || model.name)
    .filter(Boolean)
    .sort();

  return {
    providerId: provider.id,
    providerName: provider.name,
    models,
  };
}

async function handle(req: NextRequest) {
  const serverConfig = getServerSideConfig();
  const configuredPassword = serverConfig.modelCatalogPassword?.trim();

  if (!configuredPassword) {
    return NextResponse.json(
      { error: true, message: "Model catalog password is not configured." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (body.password !== configuredPassword) {
    return NextResponse.json(
      { error: true, message: "Wrong password." },
      { status: 401 },
    );
  }

  const providers = serverConfig.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  }));

  const results = await Promise.all(providers.map(fetchProviderModels));
  return NextResponse.json({ providers: results });
}

export const POST = handle;
export const runtime = "edge";
