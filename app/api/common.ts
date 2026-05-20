import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import { OPENAI_BASE_URL, ServiceProvider } from "../constant";
import { isModelAvailableInServer } from "../utils/model";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";

const serverConfig = getServerSideConfig();

function normalizeBaseUrl(baseUrl: string) {
  let normalized = baseUrl;

  if (!normalized.startsWith("http")) {
    normalized = `https://${normalized}`;
  }

  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function buildFetchUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath =
    normalizedBaseUrl.endsWith("/v1") && path.startsWith("v1/")
      ? path.slice(3)
      : path;

  return cloudflareAIGatewayUrl(`${normalizedBaseUrl}/${normalizedPath}`);
}

export async function requestOpenai(req: NextRequest) {
  const controller = new AbortController();

  let authValue = req.headers.get("Authorization") ?? "";

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/openai/", "");

  let baseUrl = serverConfig.baseUrl || OPENAI_BASE_URL;
  let requestBody: BodyInit | null | undefined = req.body;

  if (serverConfig.providers.length > 0 && req.body) {
    try {
      const clonedBody = await req.text();
      const jsonBody = JSON.parse(clonedBody) as {
        model?: string;
        providerId?: string;
      };

      const provider =
        serverConfig.providers.find(
          (item) => item.id === jsonBody.providerId,
        ) ??
        serverConfig.providers.find((item) =>
          item.models.some((model) => model.model === jsonBody.model),
        );

      if (!provider) {
        return NextResponse.json(
          {
            error: true,
            message: `No provider is configured for ${jsonBody.model}`,
          },
          {
            status: 403,
          },
        );
      }

      const allowedModel = provider.models.some(
        (model) => model.model === jsonBody.model,
      );

      if (!allowedModel) {
        return NextResponse.json(
          {
            error: true,
            message: `${jsonBody.model} is not allowed for ${provider.id}`,
          },
          {
            status: 403,
          },
        );
      }

      baseUrl = provider.baseUrl;
      authValue = `Bearer ${provider.apiKey}`;
      delete jsonBody.providerId;
      requestBody = JSON.stringify(jsonBody);
    } catch (e) {
      console.error("[OpenAI] provider routing", e);
    }
  }

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  const fetchUrl = buildFetchUrl(baseUrl, path);
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Authorization: authValue,
      ...(serverConfig.openaiOrgId && {
        "OpenAI-Organization": serverConfig.openaiOrgId,
      }),
    },
    method: req.method,
    body: requestBody,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  // Teacher-controlled deployments can force one model from DEFAULT_MODEL.
  // This keeps students from bypassing the hidden model selector with local state edits.
  if (
    serverConfig.providers.length === 0 &&
    (serverConfig.customModels || serverConfig.defaultModel) &&
    req.body
  ) {
    try {
      const clonedBody = await req.text();
      const jsonBody = JSON.parse(clonedBody) as { model?: string };
      if (serverConfig.defaultModel) {
        jsonBody.model = serverConfig.defaultModel;
        fetchOptions.body = JSON.stringify(jsonBody);
      } else {
        fetchOptions.body = clonedBody;
      }

      // not undefined and is false
      if (
        serverConfig.customModels &&
        isModelAvailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          ServiceProvider.OpenAI as string,
        )
      ) {
        return NextResponse.json(
          {
            error: true,
            message: `you are not allowed to use ${jsonBody?.model} model`,
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      console.error("[OpenAI] gpt4 filter", e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // Extract the OpenAI-Organization header from the response
    const openaiOrganizationHeader = res.headers.get("OpenAI-Organization");

    // Check if serverConfig.openaiOrgId is defined and not an empty string
    if (serverConfig.openaiOrgId && serverConfig.openaiOrgId.trim() !== "") {
      console.log("[Org ID]", openaiOrganizationHeader ? "set" : "not set");
    } else {
      console.log("[Org ID] is not set up.");
    }

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    // Conditionally delete the OpenAI-Organization header from the response if [Org ID] is undefined or empty (not setup in ENV)
    // Also, this is to prevent the header from being sent to the client
    if (!serverConfig.openaiOrgId || serverConfig.openaiOrgId.trim() === "") {
      newHeaders.delete("OpenAI-Organization");
    }

    // The latest version of the OpenAI API forced the content-encoding to be "br" in json response
    // So if the streaming is disabled, we need to remove the content-encoding header
    // Because Vercel uses gzip to compress the response, if we don't remove the content-encoding header
    // The browser will try to decode the response with brotli and fail
    newHeaders.delete("content-encoding");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
