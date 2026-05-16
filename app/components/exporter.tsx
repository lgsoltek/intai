import { useMemo } from "react";

import Locale from "../locales";
import { ChatMessage, useAccessStore, useChatStore } from "../store";
import { copyToClipboard, downloadAs, getMessageTextContent } from "../utils";
import { sanitizeFilenamePart } from "../utils/students";
import CopyIcon from "../icons/copy.svg";
import DownloadIcon from "../icons/download.svg";
import { IconButton } from "./button";
import { Modal } from "./ui-lib";
import styles from "./exporter.module.scss";

function buildMarkdown(topic: string, messages: ChatMessage[]) {
  return (
    `# ${topic}\n\n` +
    messages
      .map((message) => {
        const heading =
          message.role === "user"
            ? Locale.Export.MessageFromYou
            : Locale.Export.MessageFromChatGPT;
        return `## ${heading}\n${getMessageTextContent(message).trim()}`;
      })
      .join("\n\n")
  );
}

export function ExportMessageModal(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const accessStore = useAccessStore();
  const session = chatStore.currentSession();
  const topic = session.topic || Locale.Store.DefaultTopic;
  const exportFilename =
    accessStore.studentId && accessStore.studentName
      ? `${sanitizeFilenamePart(accessStore.studentId)}-${sanitizeFilenamePart(
          accessStore.studentName,
        )}.md`
      : `${sanitizeFilenamePart(topic)}.md`;
  const mdText = useMemo(
    () => buildMarkdown(topic, session.messages),
    [session.messages, topic],
  );

  return (
    <div className="modal-mask">
      <Modal title={Locale.Export.Title} onClose={props.onClose}>
        <div className={styles["preview-actions"]}>
          <IconButton
            text={Locale.Export.Copy}
            bordered
            shadow
            icon={<CopyIcon />}
            onClick={() => copyToClipboard(mdText)}
          />
          <IconButton
            text={Locale.Export.Download}
            bordered
            shadow
            icon={<DownloadIcon />}
            onClick={() => downloadAs(mdText, exportFilename)}
          />
        </div>
        <div className="markdown-body">
          <pre className={styles["export-content"]}>{mdText}</pre>
        </div>
      </Modal>
    </div>
  );
}
