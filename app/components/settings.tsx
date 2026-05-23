import { useEffect } from "react";

import styles from "./settings.module.scss";

import CloseIcon from "../icons/close.svg";
import ResetIcon from "../icons/reload.svg";

import { List, ListItem, Select, showConfirm } from "./ui-lib";
import { IconButton } from "./button";

import {
  ModalConfigValidator,
  SubmitKey,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import Locale from "../locales";
import { Path, ServiceProvider } from "../constant";
import { ErrorBoundary } from "./error";
import { useNavigate } from "react-router-dom";
import { useAllModels } from "../utils/hooks";

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
            <ListItem title={Locale.Settings.Model}>
              <Select
                value={`${config.modelConfig.model}@${config.modelConfig.providerName}`}
                onChange={(e) => {
                  const [model, providerName] =
                    e.currentTarget.value.split("@");
                  updateConfig((config) => {
                    config.modelConfig.model =
                      ModalConfigValidator.model(model);
                    config.modelConfig.providerName =
                      providerName as ServiceProvider;
                  });
                }}
              >
                {allModels
                  .filter((v) => v.available)
                  .map((v, i) => (
                    <option
                      value={`${v.name}@${v.provider?.providerName}`}
                      key={i}
                    >
                      {v.displayName}({v.provider?.providerName})
                    </option>
                  ))}
              </Select>
            </ListItem>
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

        <AccountItems />

        <DangerItems />
      </div>
    </ErrorBoundary>
  );
}
