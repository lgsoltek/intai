import styles from "./home.module.scss";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DraggableProvided,
  OnDragEndResponder,
} from "@hello-pangea/dnd";

import { useChatStore } from "../store";

import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { MaskAvatar } from "./mask";
import { Mask } from "../store/mask";
import { useRef, useEffect, useState, type MutableRefObject } from "react";

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  confirmingDelete?: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  mask: Mask;
}) {
  const { pathname: currentPath } = useLocation();
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);

  return (
    <Draggable draggableId={`${props.id}`} index={props.index}>
      {(provided) => (
        <ChatItemView
          {...props}
          currentPath={currentPath}
          provided={provided}
          draggableRef={draggableRef}
        />
      )}
    </Draggable>
  );
}

function ChatItemView(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  confirmingDelete?: boolean;
  narrow?: boolean;
  mask: Mask;
  currentPath?: string;
  provided?: DraggableProvided;
  draggableRef?: MutableRefObject<HTMLDivElement | null>;
  isClone?: boolean;
}) {
  const isSelected =
    props.selected &&
    (props.currentPath === Path.Chat || props.currentPath === Path.Home);

  return (
    <div
      className={`${styles["chat-item"]} ${
        isSelected ? styles["chat-item-selected"] : ""
      } ${props.isClone ? styles["chat-item-drag-clone"] : ""}`}
      onClick={props.onClick}
      ref={(ele) => {
        props.draggableRef && (props.draggableRef.current = ele);
        props.provided?.innerRef(ele);
      }}
      {...props.provided?.draggableProps}
      {...props.provided?.dragHandleProps}
      title={`${props.title}\n${Locale.ChatItem.ChatItemCount(props.count)}`}
    >
      {props.narrow ? (
        <div className={styles["chat-item-narrow"]}>
          <div className={styles["chat-item-avatar"] + " no-dark"}>
            <MaskAvatar
              avatar={props.mask.avatar}
              model={props.mask.modelConfig.model}
            />
          </div>
          <div className={styles["chat-item-narrow-count"]}>{props.count}</div>
        </div>
      ) : (
        <>
          <div className={styles["chat-item-title"]}>{props.title}</div>
          <div className={styles["chat-item-info"]}>
            <div className={styles["chat-item-count"]}>
              {Locale.ChatItem.ChatItemCount(props.count)}
            </div>
            <div className={styles["chat-item-date"]}>{props.time}</div>
          </div>
        </>
      )}

      {!props.isClone && (
        <button
          className={`${styles["chat-item-delete"]} ${
            props.confirmingDelete ? styles["chat-item-delete-confirming"] : ""
          }`}
          data-chat-delete-button
          aria-label={
            props.confirmingDelete
              ? Locale.Home.DeleteChatConfirm
              : Locale.Home.DeleteChat
          }
          onClickCapture={(e) => {
            props.onDelete?.();
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {props.confirmingDelete ? (
            <span>{Locale.Home.DeleteChatConfirm}</span>
          ) : (
            <span aria-hidden="true">×</span>
          )}
        </button>
      )}
    </div>
  );
}

export function ChatList(props: { narrow?: boolean }) {
  const [sessions, selectedIndex, selectSession, moveSession] = useChatStore(
    (state) => [
      state.sessions,
      state.currentSessionIndex,
      state.selectSession,
      state.moveSession,
    ],
  );
  const chatStore = useChatStore();
  const navigate = useNavigate();
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const dismissDeleteConfirm = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-chat-delete-button]")) {
        setConfirmingDeleteId(null);
      }
    };

    document.addEventListener("pointerdown", dismissDeleteConfirm);
    return () => {
      document.removeEventListener("pointerdown", dismissDeleteConfirm);
    };
  }, []);

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    moveSession(source.index, destination.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable
        droppableId="chat-list"
        renderClone={(provided, _snapshot, rubric) => {
          const item = sessions[rubric.source.index];
          return (
            <ChatItemView
              title={item.topic}
              time={new Date(item.lastUpdate).toLocaleString()}
              count={item.messages.length}
              selected={rubric.source.index === selectedIndex}
              provided={provided}
              narrow={props.narrow}
              mask={item.mask}
              isClone
            />
          );
        }}
        getContainerForClone={() => document.body}
      >
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {sessions.map((item, i) => (
              <ChatItem
                title={item.topic}
                time={new Date(item.lastUpdate).toLocaleString()}
                count={item.messages.length}
                key={item.id}
                id={item.id}
                index={i}
                selected={i === selectedIndex}
                confirmingDelete={confirmingDeleteId === item.id}
                onClick={() => {
                  setConfirmingDeleteId(null);
                  navigate(Path.Chat);
                  selectSession(i);
                }}
                onDelete={() => {
                  if (confirmingDeleteId === item.id) {
                    chatStore.deleteSession(i);
                    setConfirmingDeleteId(null);
                  } else {
                    setConfirmingDeleteId(item.id);
                  }
                }}
                narrow={props.narrow}
                mask={item.mask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
