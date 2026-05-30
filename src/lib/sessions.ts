export type SessionStatus =
  | "active"
  | "running"
  | "completed"
  | "failed"
  | "due_review";

export interface SessionEntry {
  id: string;
  title: string;
  status: SessionStatus;
}

interface ApiSessionRow {
  id?: string;
  session_id?: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
}

export function normalizeSession(row: ApiSessionRow): SessionEntry {
  const id = row.session_id ?? row.id;
  if (!id) {
    throw new Error("Session row did not include an id");
  }

  return {
    id,
    title: row.title ?? row.name ?? "Untitled session",
    status: normalizeSessionStatus(row.status),
  };
}

export function normalizeSessions(rows: ApiSessionRow[]): SessionEntry[] {
  return rows.map(normalizeSession);
}

function normalizeSessionStatus(status: string | null | undefined): SessionStatus {
  if (
    status === "active" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "due_review"
  ) {
    return status;
  }
  return "active";
}
