"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiPath, Path } from "../constant";
import { downloadAs } from "../utils";
import { IconButton } from "./button";
import styles from "./teacher-history.module.scss";

type ConversationListItem = {
  pathname: string;
  updatedAt: string;
};

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
  const navigate = useNavigate();
  const [teacherCode, setTeacherCode] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [selected, setSelected] = useState<Conversation>();
  const [message, setMessage] = useState(
    "Enter the teacher password to load saved conversations.",
  );
  const [loading, setLoading] = useState(false);

  const headers = { "x-teacher-history-code": teacherCode };

  async function loadList() {
    setLoading(true);
    setSelected(undefined);
    try {
      const response = await fetch(`${ApiPath.Conversations}/teacher/list`, {
        headers,
      });
      if (!response.ok) {
        setItems([]);
        setMessage("The password was not accepted.");
        return;
      }
      const data = (await response.json()) as {
        conversations: ConversationListItem[];
      };
      setItems(data.conversations);
      setMessage(
        data.conversations.length === 0
          ? "No test conversations have been saved yet."
          : `${data.conversations.length} saved conversation(s).`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(item: ConversationListItem) {
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
      setSelected((await response.json()) as Conversation);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Conversation History</h1>
          <p>Teacher view for saved test conversations</p>
        </div>
        <IconButton text="Back" bordered onClick={() => navigate(Path.Auth)} />
      </header>

      <section className={styles.login}>
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
        <span>{message}</span>
      </section>

      <main className={styles.content}>
        <aside className={styles.list}>
          {items.map((item) => (
            <button key={item.pathname} onClick={() => openConversation(item)}>
              <strong>{item.pathname.split("/").at(-2)}</strong>
              <span>{new Date(item.updatedAt).toLocaleString()}</span>
            </button>
          ))}
        </aside>

        <article className={styles.transcript}>
          {selected ? (
            <>
              <div className={styles.transcriptHeader}>
                <h2>
                  {selected.studentName} ({selected.studentId})
                </h2>
                <IconButton
                  text="Download Markdown"
                  bordered
                  onClick={() =>
                    downloadAs(
                      buildMarkdown(selected),
                      `${selected.studentId}-conversation.md`,
                    )
                  }
                />
              </div>
              <p className={styles.meta}>
                {selected.topic} | Updated {selected.updatedAt}
              </p>
              {selected.messages.map((chatMessage) => (
                <div key={chatMessage.id} className={styles.message}>
                  <strong>
                    {chatMessage.role === "user" ? "Student" : "Assistant"}
                  </strong>
                  <small>{chatMessage.date}</small>
                  <pre>{messageText(chatMessage)}</pre>
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
