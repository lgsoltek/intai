function envKey(providerId, name) {
  return `PROVIDER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${name}`;
}

function normalizeBaseUrl(baseUrl) {
  let normalized = baseUrl || "";
  if (!normalized) return "";
  if (!normalized.startsWith("http")) normalized = `https://${normalized}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

async function listModels(providerId) {
  const name = process.env[envKey(providerId, "NAME")] || providerId;
  const baseUrl = normalizeBaseUrl(process.env[envKey(providerId, "BASE_URL")]);
  const apiKey = process.env[envKey(providerId, "API_KEY")];

  if (!baseUrl || !apiKey) {
    return {
      providerId,
      name,
      error: "Missing base URL or API key",
      models: [],
    };
  }

  const modelsUrl = baseUrl.endsWith("/v1")
    ? `${baseUrl}/models`
    : `${baseUrl}/v1/models`;

  const response = await fetch(modelsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    return {
      providerId,
      name,
      error: `${response.status} ${response.statusText}`,
      models: [],
    };
  }

  const json = await response.json();
  const models = (json.data ?? [])
    .map((model) => model.id || model.name)
    .filter(Boolean)
    .sort();

  return {
    providerId,
    name,
    models,
  };
}

const providerIds = (process.env.PROVIDERS ?? "")
  .split(",")
  .map((providerId) => providerId.trim())
  .filter(Boolean);

if (providerIds.length === 0) {
  console.error("No providers configured. Set PROVIDERS first.");
  process.exit(1);
}

const results = await Promise.all(providerIds.map(listModels));

for (const result of results) {
  console.log(`\n# ${result.name} (${result.providerId})`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
    continue;
  }
  for (const model of result.models) {
    console.log(model);
  }
}
