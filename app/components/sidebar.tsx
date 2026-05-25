import { useEffect, useRef, useMemo } from "react";

import styles from "./home.module.scss";

import { IconButton } from "./button";
import TapeLogoIcon from "../icons/tape-logo.svg";
import DragIcon from "../icons/drag.svg";

import Locale, { changeLang, getLang, Lang } from "../locales";

import { Theme, useAccessStore, useAppConfig, useChatStore } from "../store";

import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  Path,
} from "../constant";

import { Link, useLocation, useNavigate } from "react-router-dom";
import { isIOS, useMobileScreen } from "../utils";
import dynamic from "next/dynamic";

const ChatList = dynamic(async () => (await import("./chat-list")).ChatList, {
  loading: () => null,
});

function useHotKey() {
  const chatStore = useChatStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey) {
        if (e.key === "ArrowUp") {
          chatStore.nextSession(-1);
        } else if (e.key === "ArrowDown") {
          chatStore.nextSession(1);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}

function useDragSideBar() {
  const limit = (x: number) =>
    Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, x));

  const config = useAppConfig();
  const startX = useRef(0);
  const startDragWidth = useRef(config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
  const lastUpdateTime = useRef(Date.now());

  const onDragStart = (e: MouseEvent) => {
    // Remembers the initial width each time the mouse is pressed
    startX.current = e.clientX;
    startDragWidth.current = config.sidebarWidth;
    const handleDragMove = (e: MouseEvent) => {
      if (Date.now() < lastUpdateTime.current + 20) {
        return;
      }
      lastUpdateTime.current = Date.now();
      const d = e.clientX - startX.current;
      const nextWidth = limit(startDragWidth.current + d);
      config.update((config) => {
        config.sidebarWidth = nextWidth;
      });
    };

    const handleDragEnd = () => {
      // In useRef the data is non-responsive, so `config.sidebarWidth` can't get the dynamic sidebarWidth
      window.removeEventListener("pointermove", handleDragMove);
      window.removeEventListener("pointerup", handleDragEnd);
    };

    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
  };

  const isMobileScreen = useMobileScreen();

  useEffect(() => {
    if (!isMobileScreen && config.sidebarWidth < MIN_SIDEBAR_WIDTH) {
      config.update((config) => {
        config.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
      });
    }
  }, [config, config.sidebarWidth, isMobileScreen]);

  useEffect(() => {
    const barWidth = limit(config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
    const sideBarWidth = isMobileScreen ? "100vw" : `${barWidth}px`;
    document.documentElement.style.setProperty("--sidebar-width", sideBarWidth);
  }, [config.sidebarWidth, isMobileScreen]);

  return {
    onDragStart,
    shouldNarrow: false,
  };
}

export function SideBar(props: { className?: string }) {
  const chatStore = useChatStore();
  const config = useAppConfig();

  // drag side bar
  const { onDragStart, shouldNarrow } = useDragSideBar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const accessStore = useAccessStore();
  const isMobileScreen = useMobileScreen();
  const isIOSMobile = useMemo(
    () => isIOS() && isMobileScreen,
    [isMobileScreen],
  );

  useHotKey();

  function nextTheme() {
    const themes = [Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(config.theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    config.update((config) => (config.theme = themes[nextIndex]));
  }

  function nextLang() {
    const langs: Lang[] = ["cn", "fr", "en"];
    const index = langs.indexOf(getLang());
    const nextIndex = (index + 1) % langs.length;
    changeLang(langs[nextIndex]);
  }

  const langLabel: Partial<Record<Lang, string>> = {
    cn: "中",
    fr: "FR",
    en: "EN",
  };

  const themeText = config.theme === Theme.Light ? "☼" : "☽";

  return (
    <div
      className={`${styles.sidebar} ${props.className} ${
        shouldNarrow && styles["narrow-sidebar"]
      }`}
      style={{
        // #3016 disable transition on ios mobile screen
        transition: isMobileScreen && isIOSMobile ? "none" : undefined,
      }}
    >
      <div className={styles["sidebar-header"]} data-tauri-drag-region>
        <div className={styles["sidebar-title"]} data-tauri-drag-region>
          TAPE.LLM
        </div>
        <div className={styles["sidebar-logo"] + " no-dark"}>
          <TapeLogoIcon />
        </div>
      </div>

      <div className={styles["sidebar-header-bar"]}>
        <div className={styles["sidebar-sub-title"]}>
          Adapted by XIE ©2026.
        </div>
        <div className={styles["sidebar-sub-title"]}>Based on NextChat.</div>
      </div>

      <div className={styles["student-card"]}>
        <div className={styles["student-card-label"]}>
          {Locale.Student.Label}
        </div>
        {accessStore.studentConfirmed ? (
          <>
            <div className={styles["student-card-name"]}>
              {accessStore.studentName}
            </div>
            <div className={styles["student-card-id"]}>
              {accessStore.studentId}
            </div>
          </>
        ) : (
          <div className={styles["student-card-empty"]}>
            {Locale.Student.NotConfirmed}
          </div>
        )}
      </div>

      <div className={styles["sidebar-create"]}>
        <IconButton
          text={shouldNarrow ? undefined : Locale.Home.NewChat}
          onClick={() => {
            chatStore.newSession();
            navigate(Path.Chat);
          }}
          type="primary"
          shadow
          className={styles["new-chat-button"]}
        />
      </div>

      <div
        className={styles["sidebar-body"]}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            navigate(Path.Home);
          }
        }}
      >
        <ChatList narrow={shouldNarrow} />
      </div>

      <div className={styles["sidebar-tail"]}>
        <div className={styles["sidebar-actions"]}>
          <div className={styles["sidebar-action"]}>
            <Link to={pathname === Path.Settings ? Path.Home : Path.Settings}>
              <IconButton
                icon={
                  <span
                    className={styles["settings-glyph"]}
                    aria-hidden="true"
                  />
                }
                shadow
              />
            </Link>
          </div>
          <div className={styles["sidebar-action"]}>
            <IconButton
              icon={
                <span className={styles["theme-glyph"]} aria-hidden="true">
                  {themeText}
                </span>
              }
              onClick={nextTheme}
              shadow
              className={styles["theme-cycle-button"]}
            />
          </div>
          <div className={styles["sidebar-action"]}>
            <IconButton
              text={langLabel[getLang()] ?? "EN"}
              onClick={nextLang}
              shadow
              title={Locale.Settings.Lang.Name}
              className={styles["language-cycle-button"]}
            />
          </div>
        </div>
      </div>

      <div
        className={styles["sidebar-drag"]}
        onPointerDown={(e) => onDragStart(e as any)}
      >
        <DragIcon />
      </div>
    </div>
  );
}
