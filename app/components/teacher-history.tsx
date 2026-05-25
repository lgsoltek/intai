"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiPath } from "../constant";
import Locale from "../locales";
import MaxIcon from "../icons/max.svg";
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

function RefreshGlyph() {
  return (
    <svg className={styles.actionGlyph} viewBox="0 0 24 24">
      <path d="M20 11a8 8 0 0 0-14-5.25L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14 5.25L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg className={styles.actionGlyph} viewBox="0 0 24 24">
      <path d="M7 3v4M17 3v4M4 9h16" />
      <rect x="4" y="5" width="16" height="16" rx="3" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg className={styles.actionGlyph} viewBox="0 0 24 24">
      <path d="M12 4v10M8 10l4 4 4-4M5 19h14" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg className={styles.actionGlyph} viewBox="0 0 24 24">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  );
}

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

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
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
  const [dateOpen, setDateOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);
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
      if (!dateMenuRef.current?.contains(target)) {
        setDateOpen(false);
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
      const matchesQuery =
        !query ||
        [item.studentName, item.studentId, item.topic].some((field) =>
          field.toLocaleLowerCase().includes(query),
        );
      const timestamp = new Date(item.updatedAt).getTime();
      const afterStart =
        !startDate || timestamp >= new Date(`${startDate}T00:00:00`).getTime();
      const beforeEnd =
        !endDate || timestamp <= new Date(`${endDate}T23:59:59.999`).getTime();
      return matchesQuery && afterStart && beforeEnd;
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
  }, [endDate, items, search, sortBy, startDate]);
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
              <span className={styles.count}>{visibleItems.length}</span>
            </div>
            <input
              className={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search name, ID or topic"
              type="search"
            />
            <div className={styles.toolbarActions}>
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
                          option.value === sortBy ? styles.sortOptionActive : ""
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
              <div className={styles.dateMenu} ref={dateMenuRef}>
                <IconButton
                  icon={<CalendarGlyph />}
                  bordered
                  title="Filter by date"
                  onClick={() => setDateOpen((open) => !open)}
                  className={`${styles.toolButton} ${
                    startDate || endDate ? styles.toolButtonActive : ""
                  }`}
                />
                {dateOpen && (
                  <div className={styles.datePopover}>
                    <strong>Conversation dates</strong>
                    <label>
                      From
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) =>
                          setStartDate(event.currentTarget.value)
                        }
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={endDate}
                        onChange={(event) =>
                          setEndDate(event.currentTarget.value)
                        }
                      />
                    </label>
                    <button
                      className={styles.clearDates}
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                    >
                      Clear dates
                    </button>
                  </div>
                )}
              </div>
              <IconButton
                icon={<RefreshGlyph />}
                bordered
                title="Refresh conversations"
                disabled={loading || (teacherHistoryProtected && !teacherCode)}
                onClick={loadList}
                className={styles.toolButton}
              />
            </div>
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
                      {formatTimestamp(item.updatedAt)}
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
                      <span>Updated {formatTimestamp(selected.updatedAt)}</span>
                    </p>
                  </div>
                  <div className={styles.transcriptActions}>
                    <div className={styles.deleteControl} ref={deleteRef}>
                      <IconButton
                        icon={confirmDelete ? undefined : <TrashGlyph />}
                        text={confirmDelete ? "Confirm delete" : undefined}
                        bordered
                        type={confirmDelete ? "danger" : null}
                        title={
                          confirmDelete
                            ? "Click again to permanently delete"
                            : "Delete conversation"
                        }
                        className={`${styles.circleAction} ${
                          confirmDelete ? styles.confirmDeleteAction : ""
                        }`}
                        onClick={deleteConversation}
                      />
                    </div>
                    <IconButton
                      icon={<DownloadGlyph />}
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
