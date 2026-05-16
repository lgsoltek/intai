import styles from "./auth.module.scss";
import { IconButton } from "./button";

import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useAccessStore } from "../store";
import Locale from "../locales";

import BotIcon from "../icons/bot.svg";
import { useEffect, useMemo, useState } from "react";
import { getClientConfig } from "../config/client";
import { loadStudents, StudentRecord } from "../utils/students";

export function AuthPage() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [studentLookupFailed, setStudentLookupFailed] = useState(false);

  const matchedStudent = useMemo(
    () =>
      students.find(
        (student) =>
          student.id.trim().toLowerCase() ===
          accessStore.studentId.trim().toLowerCase(),
      ),
    [accessStore.studentId, students],
  );
  const canConfirmStudent = !!matchedStudent;

  const goChat = () => navigate(Path.Chat);

  const confirmAndEnter = () => {
    if (!matchedStudent) return;
    accessStore.update((access) => {
      access.studentId = matchedStudent.id;
      access.studentName = matchedStudent.name;
      access.studentConfirmed = true;
    });
    goChat();
  };

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadStudents()
      .then(setStudents)
      .catch(() => setStudentLookupFailed(true));
  }, []);

  return (
    <div className={styles["auth-page"]}>
      <div className={`no-dark ${styles["auth-logo"]}`}>
        <BotIcon />
      </div>

      <div className={styles["auth-title"]}>{Locale.Auth.Title}</div>
      <div className={styles["auth-tips"]}>{Locale.Auth.Tips}</div>

      <input
        className={styles["auth-input"]}
        type="password"
        placeholder={Locale.Auth.Input}
        value={accessStore.accessCode}
        onChange={(e) => {
          accessStore.update(
            (access) => (access.accessCode = e.currentTarget.value),
          );
        }}
      />

      <div className={styles["auth-tips"]}>{Locale.Auth.StudentId}</div>
      <input
        className={styles["auth-input"]}
        type="text"
        placeholder={Locale.Auth.StudentIdInput}
        value={accessStore.studentId}
        onChange={(e) => {
          accessStore.update((access) => {
            access.studentId = e.currentTarget.value;
            access.studentName = "";
            access.studentConfirmed = false;
          });
        }}
      />

      <div className={styles["student-confirm"]}>
        {studentLookupFailed ? (
          <span>{Locale.Auth.StudentLoadError}</span>
        ) : accessStore.studentId.trim().length === 0 ? (
          <span>{Locale.Auth.StudentIdEmpty}</span>
        ) : matchedStudent ? (
          <>
            <span className={styles["student-confirm-label"]}>
              {Locale.Auth.StudentConfirmLabel}
            </span>
            <strong>{matchedStudent.name}</strong>
            <span>{matchedStudent.id}</span>
          </>
        ) : (
          <span>{Locale.Auth.StudentNotFound}</span>
        )}
      </div>

      <div className={styles["auth-actions"]}>
        <IconButton
          text={
            matchedStudent ? Locale.Auth.ConfirmAndEnter : Locale.Auth.Confirm
          }
          type="primary"
          disabled={!canConfirmStudent}
          onClick={confirmAndEnter}
        />
      </div>
    </div>
  );
}
