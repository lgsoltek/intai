"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiPath } from "../constant";
import Locale from "../locales";
import DeleteIcon from "../icons/delete.svg";
import DownloadIcon from "../icons/download.svg";
import MaxIcon from "../icons/max.svg";
import RefreshIcon from "../icons/reload.svg";
import { Theme, useAccessStore, useAppConfig } from "../store";
import { downloadAs } from "../utils";
import { IconButton } from "./button";
import styles from "./teacher-history.module.scss";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown);

type ConversationListItem = {
  pathname: string;
  studentId: string;
  studentName: string;
  topic: string;
  updatedAt: string;
  nameSortKey: string;
  nameInitial: string;
};

type SortOption = "recent" | "oldest" | "studentId" | "studentName";

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest" },
  { value: "studentId", label: "Student ID" },
  { value: "studentName", label: "Name (Pinyin)" },
];

type ConversationMessage = {
  id: string;
  role: string;
  content: string | Array<{ type: string; text?: string }>;
  date: string;
};

type Conversation = {
  studentId: string;
  studentName: string;
  topic: string;
  updatedAt: string;
  messages: ConversationMessage[];
};

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Partial<Conversation>;
  return (
    typeof conversation.studentId === "string" &&
    typeof conversation.studentName === "string" &&
    typeof conversation.topic === "string" &&
    typeof conversation.updatedAt === "string" &&
    Array.isArray(conversation.messages)
  );
}

function messageText(message: ConversationMessage) {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => (part.type === "text" ? part.text ?? "" : "[Image]"))
    .join("\n");
}

function buildMarkdown(conversation: Conversation) {
  return (
    `# ${conversation.topic || "Conversation"}\n\n` +
    `Student: ${conversation.studentName} (${conversation.studentId})\n\n` +
    conversation.messages
      .map((message) => {
        const heading = message.role === "user" ? "Student" : "Assistant";
        return `## ${heading}\n${messageText(message).trim()}`;
      })
      .join("\n\n")
  );
}

export function TeacherHistory() {
  const config = useAppConfig();
  const accessStore = useAccessStore();
  const [teacherCode, setTeacherCode] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [selected, setSelected] = useState<Conversation>();
  const [selectedPathname, setSelectedPathname] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLDivElement>(null);
  const fontSize = config.fontSize;
  const teacherHistoryProtected = accessStore.teacherHistoryProtected !== false;

  const headers = { "x-teacher-history-code": teacherCode };

  function nextTheme() {
    const themes = [Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(config.theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    config.update((appConfig) => {
      appConfig.theme = themes[nextIndex];
    });
  }

  function updateFontSize(delta: number) {
    config.update((appConfig) => {
      const current = appConfig.fontSize ?? 14;
      appConfig.fontSize = Math.max(12, Math.min(40, current + delta));
    });
  }

  async function loadList() {
    setLoading(true);
    try {
      const response = await fetch(`${ApiPath.Conversations}/teacher/list`, {
        headers,
      });
      if (!response.ok) {
        setItems([]);
        setSelected(undefined);
        setSelectedPathname("");
        setMessage(
          teacherHistoryProtected
            ? "The password was not accepted."
            : "Could not load saved conversations.",
        );
        return;
      }
      const data = await readJsonResponse<{
        conversations: ConversationListItem[];
      }>(response);
      if (!data || !Array.isArray(data.conversations)) {
        setItems([]);
        setMessage("Could not read saved conversations.");
        return;
      }
      setItems(data.conversations);
      setMessage(
        data.conversations.length === 0
          ? "No test conversations have been saved yet."
          : "",
      );
    } catch {
      setItems([]);
      setMessage("Could not load saved conversations.");
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(item: ConversationListItem) {
    setConfirmDelete(false);
    setLoading(true);
    try {
      const response = await fetch(
        `${ApiPath.Conversations}/teacher/read?pathname=${encodeURIComponent(
          item.pathname,
        )}`,
        { headers },
      );
      if (!response.ok) {
        setMessage("Could not open that conversation.");
        return;
      }
      const conversation = await readJsonResponse<unknown>(response);
      if (!isConversation(conversation)) {
        setSelected(undefined);
        setSelectedPathname("");
        setMessage("Could not read that conversation.");
        return;
      }
      setSelected(conversation);
      setSelectedPathname(item.pathname);
      setMessage("");
    } catch {
      setMessage("Could not open that conversation.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteConversation() {
    if (!selectedPathname) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${ApiPath.Conversations}/teacher/delete?pathname=${encodeURIComponent(
          selectedPathname,
        )}`,
        { method: "DELETE", headers },
      );
      if (!response.ok) {
        setMessage("Could not delete that conversation.");
        return;
      }
      setSelected(undefined);
      setSelectedPathname("");
      setConfirmDelete(false);
      await loadList();
    } catch {
      setMessage("Could not delete that conversation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!teacherHistoryProtected) {
      loadList();
    }
    // loadList intentionally runs once when password protection is disabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherHistoryProtected]);

  useEffect(() => {
    function dismissPopovers(event: PointerEvent) {
      const target = event.target as Node;
      if (!sortMenuRef.current?.contains(target)) {
        setSortOpen(false);
      }
      if (!deleteRef.current?.contains(target)) {
        setConfirmDelete(false);
      }
    }

    document.addEventListener("pointerdown", dismissPopovers);
    return () => document.removeEventListener("pointerdown", dismissPopovers);
  }, []);

  const themeText = config.theme === Theme.Light ? "☼" : "☽";
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      if (!query) return true;
      return [item.studentName, item.studentId, item.topic].some((field) =>
        field.toLocaleLowerCase().includes(query),
      );
    });

    return filtered.sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        );
      }
      if (sortBy === "studentId") {
        return a.studentId.localeCompare(b.studentId, undefined, {
          numeric: true,
        });
      }
      if (sortBy === "studentName") {
        return a.nameSortKey.localeCompare(b.nameSortKey);
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [items, search, sortBy]);
  const groupedItems = useMemo(() => {
    return visibleItems.reduce<
      Array<{ label: string; items: ConversationListItem[] }>
    >((groups, item) => {
      const label =
        sortBy === "studentName"
          ? item.nameInitial
          : sortBy === "studentId"
          ? item.studentId
          : new Date(item.updatedAt).toLocaleDateString();
      const previous = groups.at(-1);
      if (previous?.label === label) {
        previous.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
      return groups;
    }, []);
  }, [sortBy, visibleItems]);
  const activeSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? "";

  return (
    <div className={styles.page}>
      <header className={`window-header ${styles.header}`}>
        <div className="window-header-title">
          <div className="window-header-main-title">Conversation History</div>
          <div className="window-header-sub-title">
            Teacher view for saved test conversations
          </div>
        </div>
        <div className="window-actions">
          <div className={`window-action-button ${styles.fontSizeGroup}`}>
            <IconButton
              text="A-"
              title={Locale.Settings.FontSize.Title}
              onClick={() => updateFontSize(-1)}
              className={styles.fontSizeButton}
              bordered
            />
            <IconButton
              text="A+"
              title={Locale.Settings.FontSize.Title}
              onClick={() => updateFontSize(1)}
              className={styles.fontSizeButton}
              bordered
            />
          </div>
          <div className="window-action-button">
            <IconButton
              icon={
                <span className={styles.themeGlyph} aria-hidden="true">
                  {themeText}
                </span>
              }
              bordered
              title={Locale.Settings.Theme}
              onClick={nextTheme}
              className={styles.themeButton}
            />
          </div>
          <div className="window-action-button">
            <IconButton
              icon={<MaxIcon />}
              bordered
              title={Locale.Settings.TightBorder}
              onClick={() => {
                config.update((appConfig) => {
                  appConfig.tightBorder = !appConfig.tightBorder;
                });
              }}
            />
          </div>
        </div>
      </header>

      {teacherHistoryProtected ? (
        <section className={styles.authArea}>
          <div className={styles.login}>
            <input
              type="password"
              placeholder="Teacher password"
              value={teacherCode}
              onChange={(event) => setTeacherCode(event.currentTarget.value)}
              onKeyDown={(event) => event.key === "Enter" && loadList()}
            />
            <IconButton
              type="primary"
              text={loading ? "Loading..." : "Load History"}
              disabled={!teacherCode || loading}
              onClick={loadList}
            />
          </div>
          {message && <span className={styles.feedback}>{message}</span>}
        </section>
      ) : message ? (
        <div className={styles.openFeedback}>{message}</div>
      ) : null}

      <main className={styles.content}>
        <aside className={styles.list}>
          <div className={styles.listToolbar}>
            <div className={styles.listHeader}>
              <strong>Saved Conversations</strong>
              <div className={styles.toolbarActions}>
                <span className={styles.count}>{visibleItems.length}</span>
                <div className={styles.sortMenu} ref={sortMenuRef}>
                  <IconButton
                    icon={
                      <span className={styles.sortGlyph} aria-hidden="true">
                        ⇅
                      </span>
                    }
                    bordered
                    title={`Sort: ${activeSortLabel}`}
                    onClick={() => setSortOpen((open) => !open)}
                    className={styles.toolButton}
                  />
                  {sortOpen && (
                    <div className={styles.sortPopover}>
                      {sortOptions.map((option) => (
                        <button
                          className={`${styles.sortOption} ${
                            option.value === sortBy
                              ? styles.sortOptionActive
                              : ""
                          }`}
                          key={option.value}
                          onClick={() => {
                            setSortBy(option.value);
                            setSortOpen(false);
                          }}
                        >
                          {option.label}
                          {option.value === sortBy && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <IconButton
                  icon={<RefreshIcon />}
                  bordered
                  title="Refresh conversations"
                  disabled={
                    loading || (teacherHistoryProtected && !teacherCode)
                  }
                  onClick={loadList}
                  className={styles.toolButton}
                />
              </div>
            </div>
            <input
              className={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search name, ID or topic"
              type="search"
            />
          </div>
          <div className={styles.listCards}>
            {groupedItems.map((group) => (
              <section className={styles.cardGroup} key={group.label}>
                <div className={styles.groupHeader}>{group.label}</div>
                {group.items.map((item) => (
                  <button
                    className={`${styles.listCard} ${
                      selectedPathname === item.pathname
                        ? styles.listCardActive
                        : ""
                    }`}
                    key={item.pathname}
                    onClick={() => openConversation(item)}
                  >
                    <span className={styles.studentLine}>
                      <strong className={styles.studentName}>
                        {item.studentName || "Unnamed student"}
                      </strong>
                      <span className={styles.studentPill}>
                        {item.studentId}
                      </span>
                    </span>
                    <span className={styles.cardDate}>
                      {new Date(item.updatedAt).toLocaleString()}
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <article className={styles.transcript}>
          {selected ? (
            <>
              <div className={styles.transcriptSummary}>
                <div className={styles.transcriptHeader}>
                  <div className={styles.transcriptIdentity}>
                    <h2>
                      {selected.studentName} ({selected.studentId})
                    </h2>
                    <p className={styles.meta}>
                      <span>{selected.topic}</span>
                      <span>Updated {selected.updatedAt}</span>
                    </p>
                  </div>
                  <div className={styles.transcriptActions}>
                    <IconButton
                      icon={<DownloadIcon />}
                      bordered
                      title="Download Markdown"
                      className={styles.circleAction}
                      onClick={() =>
                        downloadAs(
                          buildMarkdown(selected),
                          `${selected.studentId}-conversation.md`,
                        )
                      }
                    />
                    <div className={styles.deleteControl} ref={deleteRef}>
                      <IconButton
                        icon={<DeleteIcon />}
                        bordered
                        type={confirmDelete ? "danger" : null}
                        title={
                          confirmDelete
                            ? "Click again to permanently delete"
                            : "Delete conversation"
                        }
                        className={styles.circleAction}
                        onClick={deleteConversation}
                      />
                      {confirmDelete && (
                        <div className={styles.deleteConfirm}>
                          Click again to delete
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {selected.messages.map((chatMessage) => (
                <div
                  key={chatMessage.id}
                  className={`${styles.message} ${
                    chatMessage.role === "user" ? styles.messageUser : ""
                  }`}
                >
                  <div className={styles.messageHeader}>
                    <strong
                      className={`${styles.speakerPill} ${
                        chatMessage.role === "user"
                          ? styles.speakerPillUser
                          : styles.speakerPillLlm
                      }`}
                    >
                      {chatMessage.role === "user" ? "Student" : "Assistant"}
                    </strong>
                    <small>{chatMessage.date}</small>
                  </div>
                  <div className={styles.messageBody}>
                    <Markdown
                      content={messageText(chatMessage)}
                      fontSize={fontSize}
                    />
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className={styles.empty}>Select a conversation to read it.</p>
          )}
        </article>
      </main>
    </div>
  );
}
