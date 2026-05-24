export interface StudentRecord {
  id: string;
  name: string;
}

const DEFAULT_STUDENTS_CSV_PATH = "/students.csv";
const STUDENTS_CSV_BY_BRANCH: Record<string, string> = {
  main: "/students-main.csv",
  multiprovider: "/students-multiprovider.csv",
};

function getStudentsCsvPath() {
  const configuredPath = process.env.NEXT_PUBLIC_STUDENTS_CSV_PATH?.trim();
  if (configuredPath) return configuredPath;

  const branchName = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF?.trim();
  if (branchName && STUDENTS_CSV_BY_BRANCH[branchName]) {
    return STUDENTS_CSV_BY_BRANCH[branchName];
  }

  return DEFAULT_STUDENTS_CSV_PATH;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function parseStudentsCsv(csv: string): StudentRecord[] {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const [headerLine, ...dataLines] = rows;
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase());
  const idIndex = headers.indexOf("id");
  const nameIndex = headers.indexOf("name");

  if (idIndex < 0 || nameIndex < 0) return [];

  return dataLines
    .map((line) => {
      const row = parseCsvLine(line);
      return {
        id: row[idIndex]?.trim() ?? "",
        name: row[nameIndex]?.trim() ?? "",
      };
    })
    .filter((student) => student.id && student.name);
}

export async function loadStudents() {
  const response = await fetch(getStudentsCsvPath(), { cache: "no-store" });
  if (!response.ok) return [];
  return parseStudentsCsv(await response.text());
}

export function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^-+|-+$/g, "");
}
