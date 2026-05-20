import { useEffect, useMemo, useState } from "react";

import styles from "./settings.module.scss";

import CloseIcon from "../icons/close.svg";
import ResetIcon from "../icons/reload.svg";

import { InputRange } from "./input-range";
import { List, ListItem, Select, showConfirm } from "./ui-lib";
import { IconButton } from "./button";

import {
  ModalConfigValidator,
  SubmitKey,
  Theme,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import Locale, {
  AllLangs,
  ALL_LANG_OPTIONS,
  changeLang,
  getLang,
} from "../locales";
import { Path, ServiceProvider } from "../constant";
import { ErrorBoundary } from "./error";
import { useNavigate } from "react-router-dom";
import { useAllModels } from "../utils/hooks";

type ModelCatalogProvider = {
  providerId: string;
  providerName: string;
  error?: string;
  models: string[];
};

function ModelCatalogItems() {
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ModelCatalogProvider[]>([]);

  async function loadCatalog() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/model-catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const json = await response.json();
      if (!response.ok || json.error) {
        throw new Error(json.message || "Failed to load model catalog.");
      }
      setProviders(json.providers ?? []);
    } catch (e) {
      setProviders([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <List>
      <ListItem
        title="Full Provider Model Catalog"
        subTitle="Password-protected live model list from configured providers."
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
      </ListItem>
      {enabled && (
        <>
          <ListItem title="Catalog Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </ListItem>
          <ListItem title="Load Catalog" subTitle={error}>
            <IconButton
              text={loading ? "Loading..." : "Load"}
              onClick={loadCatalog}
              disabled={loading || password.length === 0}
            />
          </ListItem>
          {providers.map((provider) => (
            <ListItem
              key={provider.providerId}
              title={`${provider.providerName} (${provider.providerId})`}
              subTitle={
                provider.error ||
                `${provider.models.length} models: ${provider.models.join(
                  ", ",
                )}`
              }
            />
          ))}
        </>
      )}
    </List>
  );
}

function DangerItems() {
  const chatStore = useChatStore();
  const appConfig = useAppConfig();

  return (
    <List>
      <ListItem
        className={styles["settings-action-item"]}
        title={Locale.Settings.Danger.Reset.Title}
        subTitle={Locale.Settings.Danger.Reset.SubTitle}
      >
        <IconButton
          text={Locale.Settings.Danger.Reset.Action}
          onClick={async () => {
            if (await showConfirm(Locale.Settings.Danger.Reset.Confirm)) {
              appConfig.reset();
            }
          }}
          type="danger"
        />
      </ListItem>
      <ListItem
        className={styles["settings-action-item"]}
        title={Locale.Settings.Danger.Clear.Title}
        subTitle={Locale.Settings.Danger.Clear.SubTitle}
      >
        <IconButton
          text={Locale.Settings.Danger.Clear.Action}
          onClick={async () => {
            if (await showConfirm(Locale.Settings.Danger.Clear.Confirm)) {
              chatStore.clearAllData();
            }
          }}
          type="danger"
        />
      </ListItem>
    </List>
  );
}

function AccountItems() {
  const accessStore = useAccessStore();
  const navigate = useNavigate();

  return (
    <List>
      <ListItem
        className={styles["settings-action-item"]}
        title={Locale.Settings.Logout.Title}
        subTitle={Locale.Settings.Logout.SubTitle}
      >
        <IconButton
          text={Locale.Settings.Logout.Action}
          type="danger"
          onClick={() => {
            accessStore.update((access) => {
              access.accessCode = "";
              access.openaiApiKey = "";
              access.studentId = "";
              access.studentName = "";
              access.studentConfirmed = false;
            });
            navigate(Path.Auth);
          }}
        />
      </ListItem>
    </List>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const config = useAppConfig();
  const updateConfig = config.update;
  const accessStore = useAccessStore();
  const allModels = useAllModels();
  const availableModels = useMemo(
    () => allModels.filter((model) => model.available),
    [allModels],
  );
  const providers = useMemo(() => {
    const providerMap = new Map<string, { id: string; providerName: string }>();
    availableModels.forEach((model) => {
      const provider = model.provider;
      if (!provider) return;
      providerMap.set(provider.id, {
        id: provider.id,
        providerName: provider.providerName,
      });
    });
    return Array.from(providerMap.values());
  }, [availableModels]);
  const selectedProviderId =
    config.modelConfig.providerId || providers[0]?.id || "openai";
  const providerModels = useMemo(
    () =>
      availableModels.filter(
        (model) => model.provider?.id === selectedProviderId,
      ),
    [availableModels, selectedProviderId],
  );

  useEffect(() => {
    const keydownEvent = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        navigate(Path.Home);
      }
    };
    document.addEventListener("keydown", keydownEvent);
    return () => document.removeEventListener("keydown", keydownEvent);
  }, [navigate]);

  useEffect(() => {
    if (!config.enableAutoGenerateTitle) {
      updateConfig((config) => (config.enableAutoGenerateTitle = true));
    }
  }, [config.enableAutoGenerateTitle, updateConfig]);

  return (
    <ErrorBoundary>
      <div className="window-header" data-tauri-drag-region>
        <div className="window-header-title">
          <div className="window-header-main-title">
            {Locale.Settings.Title}
          </div>
          <div className="window-header-sub-title">Interface preferences</div>
        </div>
        <div className="window-actions">
          <div className="window-action-button"></div>
          <div className="window-action-button"></div>
          <div className="window-action-button">
            <IconButton
              icon={<CloseIcon />}
              onClick={() => navigate(Path.Home)}
              bordered
            />
          </div>
        </div>
      </div>
      <div className={styles["settings"]}>
        <List>
          <ListItem title={Locale.Settings.SendKey}>
            <Select
              value={config.submitKey}
              onChange={(e) => {
                updateConfig(
                  (config) =>
                    (config.submitKey = e.target.value as any as SubmitKey),
                );
              }}
            >
              {Object.values(SubmitKey).map((v) => (
                <option value={v} key={v}>
                  {v}
                </option>
              ))}
            </Select>
          </ListItem>

          <ListItem title={Locale.Settings.Theme}>
            <Select
              value={config.theme}
              onChange={(e) => {
                updateConfig(
                  (config) => (config.theme = e.target.value as any as Theme),
                );
              }}
            >
              {[Theme.Light, Theme.Dark].map((v) => (
                <option value={v} key={v}>
                  {v}
                </option>
              ))}
            </Select>
          </ListItem>

          <ListItem title={Locale.Settings.Lang.Name}>
            <Select
              value={getLang()}
              onChange={(e) => {
                changeLang(e.target.value as any);
              }}
            >
              {AllLangs.map((lang) => (
                <option value={lang} key={lang}>
                  {ALL_LANG_OPTIONS[lang]}
                </option>
              ))}
            </Select>
          </ListItem>

          <ListItem
            title={Locale.Settings.FontSize.Title}
            subTitle={Locale.Settings.FontSize.SubTitle}
          >
            <InputRange
              title={`${config.fontSize ?? 14}px`}
              value={config.fontSize}
              min="12"
              max="40"
              step="1"
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.fontSize = Number.parseInt(e.currentTarget.value)),
                )
              }
            />
          </ListItem>

          <ListItem
            title={Locale.Settings.SendPreviewBubble.Title}
            subTitle={Locale.Settings.SendPreviewBubble.SubTitle}
          >
            <input
              type="checkbox"
              checked={config.sendPreviewBubble}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.sendPreviewBubble = e.currentTarget.checked),
                )
              }
            />
          </ListItem>
        </List>

        <List>
          {accessStore.enableModelSelector ? (
            <>
              <ListItem title="Provider">
                <Select
                  value={selectedProviderId}
                  onChange={(e) => {
                    const providerId = e.currentTarget.value;
                    const nextModel = availableModels.find(
                      (model) => model.provider?.id === providerId,
                    );
                    const provider = nextModel?.provider;
                    if (!provider) return;
                    updateConfig((config) => {
                      config.modelConfig.providerId =
                        ModalConfigValidator.providerId(providerId);
                      config.modelConfig.providerName =
                        provider.providerName as ServiceProvider;
                      config.modelConfig.model = ModalConfigValidator.model(
                        nextModel.name,
                      );
                    });
                  }}
                >
                  {providers.map((provider) => (
                    <option value={provider.id} key={provider.id}>
                      {provider.providerName}
                    </option>
                  ))}
                </Select>
              </ListItem>
              <ListItem title={Locale.Settings.Model}>
                <Select
                  value={config.modelConfig.model}
                  onChange={(e) => {
                    const model = e.currentTarget.value;
                    const selectedModel = providerModels.find(
                      (item) => item.name === model,
                    );
                    const provider = selectedModel?.provider;
                    if (!provider) return;
                    updateConfig((config) => {
                      config.modelConfig.model =
                        ModalConfigValidator.model(model);
                      config.modelConfig.providerId =
                        ModalConfigValidator.providerId(selectedProviderId);
                      config.modelConfig.providerName =
                        provider.providerName as ServiceProvider;
                    });
                  }}
                >
                  {providerModels.map((model) => (
                    <option value={model.name} key={model.name}>
                      {model.displayName || model.name}
                    </option>
                  ))}
                </Select>
              </ListItem>
            </>
          ) : (
            <ListItem
              title={Locale.Settings.ModelFixed.Title}
              subTitle={Locale.Settings.ModelFixed.SubTitle}
            >
              <IconButton
                icon={<ResetIcon />}
                text={config.modelConfig.model}
              />
            </ListItem>
          )}
        </List>

        <ModelCatalogItems />

        <AccountItems />

        <DangerItems />
      </div>
    </ErrorBoundary>
  );
}
