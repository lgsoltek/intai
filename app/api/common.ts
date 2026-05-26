import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import { OPENAI_BASE_URL, OpenaiPath, ServiceProvider } from "../constant";
import { isModelAvailableInServer } from "../utils/model";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";
import { getTutorSystemPrompt } from "./openai/tutor-system-prompt";

const serverConfig = getServerSideConfig();

export async function requestOpenai(req: NextRequest) {
  const controller = new AbortController();

  var authValue,
    authHeaderName = "";
  authValue = req.headers.get("Authorization") ?? "";
  authHeaderName = "Authorization";

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/openai/", "");

  let baseUrl = serverConfig.baseUrl || OPENAI_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  const fetchUrl = cloudflareAIGatewayUrl(`${baseUrl}/${path}`);
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      [authHeaderName]: authValue,
      ...(serverConfig.openaiOrgId && {
        "OpenAI-Organization": serverConfig.openaiOrgId,
      }),
    },
    method: req.method,
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  const isChatCompletion = path === OpenaiPath.ChatPath;

  // Teacher-controlled deployments can force one model from DEFAULT_MODEL.
  // This keeps students from bypassing the hidden model selector with local state edits.
  if (
    (isChatCompletion ||
      serverConfig.customModels ||
      serverConfig.defaultModel) &&
    req.body
  ) {
    try {
      const clonedBody = await req.text();
      const jsonBody = JSON.parse(clonedBody) as {
        model?: string;
        messages?: Array<{ role: string; content: unknown }>;
      };

      if (isChatCompletion && Array.isArray(jsonBody.messages)) {
        jsonBody.messages = [
          { role: "system", content: getTutorSystemPrompt() },
          ...jsonBody.messages,
        ];
      }

      if (serverConfig.defaultModel) {
        jsonBody.model = serverConfig.defaultModel;
      }
      fetchOptions.body = JSON.stringify(jsonBody);

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
      console.error("[OpenAI] request policy injection", e);
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
