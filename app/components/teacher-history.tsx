"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiPath } from "../constant";
import Locale from "../locales";
import MaxIcon from "../icons/max.svg";
import { Theme, useAccessStore, useAppConfig } from "../store";
import { downloadAs, useMobileScreen } from "../utils";
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

const historyTimeZone = "Asia/Shanghai";
const transientMessages = new Set([
  "Showing recent 15 days.",
  "Conversations refreshed.",
  "Date filter applied.",
  "Conversation deleted.",
]);

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

function PromptGlyph() {
  return (
    <svg className={styles.actionGlyph} viewBox="0 0 24 24">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 11h6M9 15h6" />
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

function SortGlyph() {
  return (
    <svg className={styles.actionGlyph} viewBox="0 0 24 24">
      <path d="M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3" />
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

function ListGlyph() {
  return <span className={styles.listToggleGlyph} aria-hidden="true" />;
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
  return new Date(timestamp).toLocaleString(undefined, {
    timeZone: historyTimeZone,
    hour12: false,
  });
}

function formatDateGroup(timestamp: string) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    timeZone: historyTimeZone,
  });
}

function formatMessageTimestamp(timestamp: string) {
  return Number.isNaN(new Date(timestamp).getTime())
    ? timestamp
    : formatTimestamp(timestamp);
}

function formatDownloadTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "unknown-time";

  const parts = new Intl.DateTimeFormat("en", {
    timeZone: historyTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});

  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

export function TeacherHistory() {
  const config = useAppConfig();
  const accessStore = useAccessStore();
  const [teacherCode, setTeacherCode] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [selected, setSelected] = useState<Conversation>();
  const [selectedPathname, setSelectedPathname] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLDivElement>(null);
  const fontSize = config.fontSize;
  const isMobileScreen = useMobileScreen();
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

  async function loadList(successMessage = "", range = { startDate, endDate }) {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      if (range.startDate) searchParams.set("from", range.startDate);
      if (range.endDate) searchParams.set("to", range.endDate);
      const query = searchParams.size ? `?${searchParams.toString()}` : "";
      const response = await fetch(
        `${ApiPath.Conversations}/teacher/list${query}`,
        { headers },
      );
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
        isRecentWindow?: boolean;
        recentDays?: number;
      }>(response);
      if (!data || !Array.isArray(data.conversations)) {
        setItems([]);
        setMessage("Could not read saved conversations.");
        return;
      }
      setItems(data.conversations);
      setMessage(
        data.conversations.length === 0
          ? data.isRecentWindow
            ? "No conversations found in the recent 15 days."
            : "No conversations found in that date range."
          : successMessage ||
              (data.isRecentWindow ? "Showing recent 15 days." : ""),
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
    setActivePrompt("");
    if (isMobileScreen) {
      setMobileListOpen(false);
    }
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

  async function openActivePrompt() {
    setLoading(true);
    try {
      const response = await fetch(`${ApiPath.Conversations}/teacher/prompt`, {
        headers,
      });
      if (!response.ok) {
        if (response.status === 503) {
          setMessage("Set TEACHER_HISTORY_CODE to view the active prompt.");
          return;
        }
        setMessage(
          teacherHistoryProtected
            ? "The password was not accepted."
            : "Could not load the active prompt.",
        );
        return;
      }
      const data = await readJsonResponse<{ prompt?: string }>(response);
      if (!data || typeof data.prompt !== "string") {
        setMessage("Could not read the active prompt.");
        return;
      }
      setSelected(undefined);
      setSelectedPathname("");
      setActivePrompt(data.prompt);
      setMessage("");
      if (isMobileScreen) {
        setMobileListOpen(false);
      }
    } catch {
      setMessage("Could not load the active prompt.");
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
      if (isMobileScreen) {
        setMobileListOpen(true);
      }
      await loadList("Conversation deleted.");
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
    if (!transientMessages.has(message)) return;

    const timeout = window.setTimeout(() => setMessage(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [message]);

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
      return matchesQuery;
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
          : formatDateGroup(item.updatedAt);
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
  const activeDateLabel =
    startDate && startDate === endDate
      ? `On ${startDate}`
      : startDate && endDate
      ? `${startDate} - ${endDate}`
      : startDate
      ? `From ${startDate}`
      : endDate
      ? `Until ${endDate}`
      : "Recent 15 days";
  const messageIsTransient = transientMessages.has(message);

  return (
    <div className={styles.page}>
      <header className={`window-header ${styles.header}`}>
        {isMobileScreen && (
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<ListGlyph />}
                bordered
                title="Saved conversations"
                onClick={() => setMobileListOpen((open) => !open)}
                className={styles.mobileListButton}
              />
            </div>
          </div>
        )}
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
          <div className={`window-action-button ${styles.desktopOnlyAction}`}>
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
              onClick={() => loadList()}
            />
          </div>
        </section>
      ) : null}
      {message ? (
        <div
          className={`${styles.openFeedback} ${
            messageIsTransient
              ? styles.successFeedback
              : styles.attentionFeedback
          }`}
          role={messageIsTransient ? "status" : "alert"}
          aria-live={messageIsTransient ? "polite" : "assertive"}
        >
          <span>{message}</span>
          {!messageIsTransient && (
            <button
              className={styles.dismissFeedback}
              aria-label="Dismiss message"
              onClick={() => setMessage("")}
            >
              &times;
            </button>
          )}
        </div>
      ) : null}

      <main className={styles.content}>
        {isMobileScreen && mobileListOpen && selected && (
          <button
            className={styles.mobileBackdrop}
            aria-label="Close conversation list"
            onClick={() => setMobileListOpen(false)}
          />
        )}
        <aside
          className={`${styles.list} ${
            mobileListOpen ? styles.mobileListOpen : ""
          }`}
        >
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
              <div className={styles.dateMenu} ref={dateMenuRef}>
                <IconButton
                  icon={<CalendarGlyph />}
                  text={activeDateLabel}
                  bordered
                  title="Filter by date"
                  onClick={() => setDateOpen((open) => !open)}
                  className={`${styles.dateButton} ${
                    startDate || endDate ? styles.toolButtonActive : ""
                  }`}
                />
                {dateOpen && (
                  <div className={styles.datePopover}>
                    <strong>Conversation dates</strong>
                    <small>Showing recent 15 days by default</small>
                    <label>
                      From
                      <input
                        type="date"
                        value={draftStartDate}
                        onChange={(event) =>
                          setDraftStartDate(event.currentTarget.value)
                        }
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={draftEndDate}
                        onChange={(event) =>
                          setDraftEndDate(event.currentTarget.value)
                        }
                      />
                    </label>
                    <div className={styles.dateActions}>
                      <button
                        className={styles.clearDates}
                        onClick={() => {
                          setStartDate("");
                          setEndDate("");
                          setDraftStartDate("");
                          setDraftEndDate("");
                          setDateOpen(false);
                          loadList("Showing recent 15 days.", {
                            startDate: "",
                            endDate: "",
                          });
                        }}
                      >
                        Recent
                      </button>
                      <button
                        className={styles.applyDates}
                        onClick={() => {
                          setStartDate(draftStartDate);
                          setEndDate(draftEndDate);
                          setDateOpen(false);
                          loadList("Date filter applied.", {
                            startDate: draftStartDate,
                            endDate: draftEndDate,
                          });
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.sortMenu} ref={sortMenuRef}>
                <IconButton
                  icon={<SortGlyph />}
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
              <IconButton
                icon={<PromptGlyph />}
                bordered
                title="View active tutor prompt"
                disabled={loading || (teacherHistoryProtected && !teacherCode)}
                onClick={openActivePrompt}
                className={styles.toolButton}
              />
              <IconButton
                icon={<RefreshGlyph />}
                bordered
                title="Refresh conversations"
                disabled={loading || (teacherHistoryProtected && !teacherCode)}
                onClick={() => loadList("Conversations refreshed.")}
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
                    title={item.topic || "Untitled conversation"}
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
                    <span className={styles.cardTopicHint}>
                      {item.topic || "Untitled conversation"}
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <article className={styles.transcript}>
          {activePrompt ? (
            <>
              <div className={styles.transcriptSummary}>
                <div className={styles.transcriptHeader}>
                  <div className={styles.transcriptIdentity}>
                    <h2>Active Tutor Prompt</h2>
                    <p className={styles.meta}>
                      <span>Loaded from server-side configuration</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className={styles.transcriptMessages}>
                <div className={styles.message}>
                  <div className={styles.messageBody}>
                    <Markdown content={activePrompt} fontSize={fontSize} />
                  </div>
                </div>
              </div>
            </>
          ) : selected ? (
            <>
              <div className={styles.transcriptSummary}>
                <div className={styles.transcriptHeader}>
                  <div className={styles.transcriptIdentity}>
                    <h2>
                      {selected.studentName} ({selected.studentId})
                    </h2>
                    <p className={styles.meta}>
                      <span>{selected.topic}</span>
                      <span>
                        Updated {formatTimestamp(selected.updatedAt)} (UTC+8)
                      </span>
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
                          `${
                            selected.studentId
                          }-conversation-${formatDownloadTimestamp(
                            selected.updatedAt,
                          )}.md`,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
              <div className={styles.transcriptMessages}>
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
                      <small>{formatMessageTimestamp(chatMessage.date)}</small>
                    </div>
                    <div className={styles.messageBody}>
                      <Markdown
                        content={messageText(chatMessage)}
                        fontSize={fontSize}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.empty}>Select a conversation to read it.</p>
          )}
        </article>
      </main>
    </div>
  );
}
