import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

interface CreateGoalData {
  goal: string;
}

interface AddEvidenceData {
  criterionId: string;
  evidence: string;
  source?: string;
  confidence?: number;
}

export interface GoalSnapshot {
  goal: typeof schema.researchGoals.$inferSelect;
  criteria: (typeof schema.goalCriteria.$inferSelect)[];
  evidence: (typeof schema.goalEvidence.$inferSelect)[];
}

/**
 * Create a new research goal. Any existing "active" goal in the same
 * session is automatically superseded.
 */
export function createGoal(db: DB, sessionId: string, data: CreateGoalData): typeof schema.researchGoals.$inferSelect {
  const now = new Date().toISOString();

  // Supersede any existing active goal for this session
  db.update(schema.researchGoals)
    .set({ status: "superseded", updatedAt: now })
    .where(
      and(
        eq(schema.researchGoals.sessionId, sessionId),
        eq(schema.researchGoals.status, "active"),
      ),
    )
    .run();

  const id = nanoid();
  const goal = {
    id,
    sessionId,
    goal: data.goal,
    status: "active",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    uiSummary: null,
  };

  db.insert(schema.researchGoals).values(goal).run();
  return goal;
}

/**
 * Add a criterion to a research goal.
 *
 * @param required  If true the criterion type is set to "threshold";
 *                  otherwise defaults to "qualitative".
 */
export function addCriterion(
  db: DB,
  goalId: string,
  text: string,
  required: boolean = false,
): typeof schema.goalCriteria.$inferSelect {
  const now = new Date().toISOString();

  const criterion = {
    id: nanoid(),
    goalId,
    criterion: text,
    type: required ? "threshold" : "qualitative",
    targetValue: null,
    currentValue: null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.goalCriteria).values(criterion).run();
  return criterion;
}

/**
 * Add evidence to a specific criterion. Validates that the criterion
 * belongs to the specified goal before inserting.
 */
export function addEvidence(
  db: DB,
  goalId: string,
  data: AddEvidenceData,
): typeof schema.goalEvidence.$inferSelect {
  // Validate that the criterion belongs to this goal
  const [criterion] = db
    .select({ id: schema.goalCriteria.id })
    .from(schema.goalCriteria)
    .where(
      and(
        eq(schema.goalCriteria.id, data.criterionId),
        eq(schema.goalCriteria.goalId, goalId),
      ),
    )
    .limit(1)
    .all();

  if (!criterion) {
    throw new Error(
      `Criterion "${data.criterionId}" does not belong to goal "${goalId}"`,
    );
  }

  const evidence = {
    id: nanoid(),
    criterionId: data.criterionId,
    evidence: data.evidence,
    source: data.source ?? null,
    confidence: data.confidence ?? null,
    createdAt: new Date().toISOString(),
  };

  db.insert(schema.goalEvidence).values(evidence).run();
  return evidence;
}

/**
 * Update the status of a goal. If `expectedGoalId` is provided it must
 * match the current active goal's id for the session to prevent
 * lost-update races.
 */
export function updateStatus(
  db: DB,
  goalId: string,
  status: string,
  expectedGoalId?: string,
): void {
  // Optimistic concurrency check
  if (expectedGoalId) {
    const [goal] = db
      .select({ id: schema.researchGoals.id, sessionId: schema.researchGoals.sessionId })
      .from(schema.researchGoals)
      .where(eq(schema.researchGoals.id, goalId))
      .limit(1)
      .all();

    if (!goal) {
      throw new Error(`Goal "${goalId}" not found`);
    }

    const [activeGoal] = db
      .select({ id: schema.researchGoals.id })
      .from(schema.researchGoals)
      .where(
        and(
          eq(schema.researchGoals.sessionId, goal.sessionId),
          eq(schema.researchGoals.status, "active"),
        ),
      )
      .limit(1)
      .all();

    if (!activeGoal || activeGoal.id !== expectedGoalId) {
      throw new Error(
        `Concurrency conflict: expected active goal "${expectedGoalId}" but found "${activeGoal?.id ?? "none"}"`,
      );
    }
  }

  const now = new Date().toISOString();
  const values: Record<string, unknown> = { status, updatedAt: now };

  if (status === "achieved" || status === "abandoned") {
    values.completedAt = now;
  }

  db.update(schema.researchGoals)
    .set(values)
    .where(eq(schema.researchGoals.id, goalId))
    .run();
}

/**
 * Fetch a full goal snapshot: the goal itself plus all its criteria and evidence.
 */
export function getGoalSnapshot(db: DB, goalId: string): GoalSnapshot | undefined {
  const [goal] = db
    .select()
    .from(schema.researchGoals)
    .where(eq(schema.researchGoals.id, goalId))
    .limit(1)
    .all();

  if (!goal) return undefined;

  const criteria = db
    .select()
    .from(schema.goalCriteria)
    .where(eq(schema.goalCriteria.goalId, goalId))
    .all();

  // Collect all evidence for every criterion on this goal
  const evidence = criteria.flatMap((c) =>
    db
      .select()
      .from(schema.goalEvidence)
      .where(eq(schema.goalEvidence.criterionId, c.id))
      .all(),
  );

  return { goal, criteria, evidence };
}
