import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unified per-test scoring across all 3 score sources:
 *   - online   : graded_test_answers view (test_answers + answer key)
 *   - scan     : scan_grades + scans (in-person paper grading)
 *   - manual   : manual_grades (Guts / team manual grading)
 *
 * Tests can be hybrid (e.g. a Standard test could have both an online
 * portion and scanned overflow). We sum per source and report a per-source
 * breakdown so analysts can see where points came from.
 *
 * Output is keyed by the canonical user-facing entity (front_id +
 * entity_type), not by test_taker_id, because in-person scanned tests
 * frequently have no test_takers row at all (scans.taker_id is the
 * front_id, written directly).
 */

export type ScoreSource = "online" | "scan" | "manual";
export type GradeState =
  | "correct"
  | "incorrect"
  | "unsure"
  | "conflict"
  | "ungraded"
  | "unanswered";

export interface ProblemScore {
  test_problem_id: number;
  problem_number: number | null;
  source: ScoreSource;
  state: GradeState;
  points: number;
  /** Latest contributing edit/grade timestamp for tie-breaking. */
  lastEditedAt: string | null;
  /** Free-text answer when known (online + manual). null for scan. */
  answer_latex?: string | null;
}

export interface EntityScore {
  /** Canonical user-facing identifier. May be null for malformed rows. */
  front_id: number | null;
  /** "team" for team tests / Guts; "student" otherwise. */
  entity_type: "team" | "student";
  display_name: string | null;
  student_id: string | null;
  team_id: number | null;
  /** Populated when an online test_takers row exists. May be null for pure-scan entities. */
  test_taker_id: number | null;

  totalScore: number;
  problemCount: number;
  lastSubmittedAt: string | null;

  /** Per-source totals (0 when source contributed nothing). */
  scoreBreakdown: Record<ScoreSource, number>;

  /** Per-test-problem-id detail. Only includes problems with a contributing row. */
  perProblem: Record<number, ProblemScore>;
}

export interface TestScores {
  testId: number;
  isTeam: boolean;
  /** Sources that contributed at least one row. */
  sources: ScoreSource[];
  problems: Array<{
    test_problem_id: number;
    problem_number: number;
    page_number: number;
    points: number;
  }>;
  /** Already sorted: highest totalScore first, earliest lastSubmittedAt as tiebreaker. */
  entities: EntityScore[];
}

interface TestProblemRow {
  test_problem_id: number;
  problem_number: number;
  page_number: number;
  points: number | null;
}

/**
 * Resolve scan grades into a final per-(scan_id, test_problem_id) state.
 *
 * Resolution rule (must match comp/src/lib/components/InPersonScoresTable.svelte):
 *   - any row with is_override = true wins; that row's grade is final
 *   - else if all distinct (non-null) grades agree → that grade is final
 *   - else "conflict" (mixed grades / Unsure mixed in)
 *   - "Correct" → tp.points; everything else → 0
 */
async function loadScanScores(
  supabase: SupabaseClient,
  testId: number,
  problemMap: Map<number, TestProblemRow>
): Promise<{
  byTakerFrontId: Map<string, ProblemScore[]>;
  takerFrontIds: Set<string>;
}> {
  const byTakerFrontId = new Map<string, ProblemScore[]>();
  const takerFrontIds = new Set<string>();

  const { data: scans, error: scanErr } = await supabase
    .from("scans")
    .select("scan_id, taker_id")
    .eq("test_id", testId);
  if (scanErr) throw scanErr;
  if (!scans || scans.length === 0) return { byTakerFrontId, takerFrontIds };

  const scanToTaker = new Map<number, string>();
  for (const s of scans as any[]) {
    if (s.scan_id == null || s.taker_id == null) continue;
    scanToTaker.set(s.scan_id, String(s.taker_id));
    takerFrontIds.add(String(s.taker_id));
  }
  const scanIds = [...scanToTaker.keys()];
  if (scanIds.length === 0) return { byTakerFrontId, takerFrontIds };

  const { data: grades, error: gErr } = await supabase
    .from("scan_grades")
    .select("scan_id, test_problem_id, grade, is_override, created_at")
    .in("scan_id", scanIds);
  if (gErr) throw gErr;

  // Group by (scan_id, test_problem_id)
  type RawGrade = {
    grade: string | null;
    is_override: boolean | null;
    created_at: string | null;
  };
  const grouped = new Map<string, { scanId: number; tpid: number; rows: RawGrade[] }>();
  for (const g of (grades as any[]) || []) {
    if (g.scan_id == null || g.test_problem_id == null) continue;
    const key = `${g.scan_id}::${g.test_problem_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, { scanId: g.scan_id, tpid: g.test_problem_id, rows: [] });
    }
    grouped.get(key)!.rows.push({
      grade: g.grade,
      is_override: g.is_override,
      created_at: g.created_at,
    });
  }

  for (const { scanId, tpid, rows } of grouped.values()) {
    const taker = scanToTaker.get(scanId);
    if (!taker) continue;
    const tp = problemMap.get(tpid);

    let finalGrade: string | null = null;
    const override = rows.find((r) => r.is_override);
    if (override) {
      finalGrade = override.grade;
    } else {
      const distinct = [...new Set(rows.map((r) => r.grade).filter((g): g is string => g != null))];
      if (distinct.length === 0) finalGrade = null;
      else if (distinct.length === 1) finalGrade = distinct[0];
      else finalGrade = "conflict";
    }

    let state: GradeState;
    let points = 0;
    switch (finalGrade) {
      case "Correct":
        state = "correct";
        points = tp?.points ?? 0;
        break;
      case "Incorrect":
        state = "incorrect";
        break;
      case "Unsure":
        state = "unsure";
        break;
      case "conflict":
        state = "conflict";
        break;
      default:
        state = "ungraded";
    }

    const lastEditedAt = rows
      .map((r) => r.created_at)
      .filter((t): t is string => t != null)
      .sort()
      .pop() ?? null;

    if (!byTakerFrontId.has(taker)) byTakerFrontId.set(taker, []);
    byTakerFrontId.get(taker)!.push({
      test_problem_id: tpid,
      problem_number: tp?.problem_number ?? null,
      source: "scan",
      state,
      points,
      lastEditedAt,
      answer_latex: null,
    });
  }

  return { byTakerFrontId, takerFrontIds };
}

async function loadOnlineScores(
  supabase: SupabaseClient,
  testId: number,
  problemMap: Map<number, TestProblemRow>
): Promise<Map<number, ProblemScore[]>> {
  const out = new Map<number, ProblemScore[]>();
  const { data, error } = await supabase
    .from("graded_test_answers")
    .select(
      "test_taker_id, test_problem_id, score:points, correct, answer_latex, last_edited_time"
    )
    .eq("test_id", testId);
  if (error) throw error;

  for (const r of (data as any[]) || []) {
    if (r.test_taker_id == null || r.test_problem_id == null) continue;
    const tp = problemMap.get(r.test_problem_id);
    let state: GradeState;
    if (r.answer_latex == null || r.answer_latex === "") state = "unanswered";
    else if (r.correct === true) state = "correct";
    else if (r.correct === false) state = "incorrect";
    else state = "ungraded";

    if (!out.has(r.test_taker_id)) out.set(r.test_taker_id, []);
    out.get(r.test_taker_id)!.push({
      test_problem_id: r.test_problem_id,
      problem_number: tp?.problem_number ?? null,
      source: "online",
      state,
      points: typeof r.score === "number" ? r.score : 0,
      lastEditedAt: r.last_edited_time ?? null,
      answer_latex: r.answer_latex ?? null,
    });
  }
  return out;
}

async function loadManualScores(
  supabase: SupabaseClient,
  testId: number,
  problemMap: Map<number, TestProblemRow>
): Promise<Map<number, ProblemScore[]>> {
  const out = new Map<number, ProblemScore[]>();
  const { data, error } = await supabase
    .from("manual_grades")
    .select("team_id, test_problem_id, status, answer_latex, score, graded_at")
    .eq("test_id", testId);
  if (error) throw error;

  for (const r of (data as any[]) || []) {
    if (r.team_id == null || r.test_problem_id == null) continue;
    const tp = problemMap.get(r.test_problem_id);
    let state: GradeState;
    let points = 0;
    if (r.status === "correct") {
      state = "correct";
      points = typeof r.score === "number" ? r.score : tp?.points ?? 0;
    } else if (r.status === "incorrect") {
      state = "incorrect";
    } else if (r.status === "unsure") {
      state = "unsure";
    } else if (r.status == null) {
      state = "ungraded";
    } else {
      state = "ungraded";
    }
    if (!out.has(r.team_id)) out.set(r.team_id, []);
    out.get(r.team_id)!.push({
      test_problem_id: r.test_problem_id,
      problem_number: tp?.problem_number ?? null,
      source: "manual",
      state,
      points,
      lastEditedAt: r.graded_at ?? null,
      answer_latex: r.answer_latex ?? null,
    });
  }
  return out;
}

/**
 * Look up canonical (front_id, display_name, student_id, team_id, test_taker_id)
 * for every entity that participated in this test, across all 3 sources.
 *
 * For team tests: keyed by team_id; front_id from teams.front_id.
 * For individual tests: keyed by student_id; front_id from student_events.front_id (scoped to event).
 *
 * Scan-only entities (no test_takers row) are still included — keyed via
 * their scans.taker_id (which is the stringified front_id).
 */
async function buildEntityIndex(
  supabase: SupabaseClient,
  testId: number,
  eventId: number,
  isTeam: boolean,
  onlineTakerIds: number[],
  manualTeamIds: number[],
  scanTakerFrontIds: Set<string>
): Promise<{
  /** Online: test_taker_id → entity key */
  takerKey: Map<number, string>;
  /** Manual: team_id → entity key */
  teamKey: Map<number, string>;
  /** Scan: front_id (string) → entity key */
  scanKey: Map<string, string>;
  /** entity key → resolved info */
  entities: Map<string, EntityScore>;
}> {
  const takerKey = new Map<number, string>();
  const teamKey = new Map<number, string>();
  const scanKey = new Map<string, string>();
  const entities = new Map<string, EntityScore>();

  // Pull test_takers detail for the online ids first.
  const takerInfo = new Map<
    number,
    { student_id: string | null; team_id: number | null; taker_name: string | null }
  >();
  if (onlineTakerIds.length > 0) {
    const { data, error } = await supabase
      .from("test_takers_detailed")
      .select("test_taker_id, student_id, team_id, taker_name")
      .in("test_taker_id", onlineTakerIds);
    if (error) throw error;
    for (const t of (data as any[]) || []) {
      takerInfo.set(t.test_taker_id, {
        student_id: t.student_id ?? null,
        team_id: t.team_id ?? null,
        taker_name: t.taker_name ?? null,
      });
    }
  }

  // Collect every team_id and student_id we need to resolve front_ids/names for.
  const teamIds = new Set<number>(manualTeamIds);
  const studentIds = new Set<string>();
  for (const t of takerInfo.values()) {
    if (t.team_id != null) teamIds.add(t.team_id);
    if (t.student_id != null) studentIds.add(t.student_id);
  }

  const teamFrontId = new Map<number, number | null>();
  const teamName = new Map<number, string | null>();
  if (teamIds.size > 0) {
    const { data, error } = await supabase
      .from("teams")
      .select("team_id, front_id, team_name")
      .in("team_id", [...teamIds]);
    if (error) throw error;
    for (const t of (data as any[]) || []) {
      teamFrontId.set(t.team_id, t.front_id ?? null);
      teamName.set(t.team_id, t.team_name ?? null);
    }
  }

  const studentFrontId = new Map<string, number | null>();
  const studentName = new Map<string, string | null>();
  if (studentIds.size > 0) {
    const { data, error } = await supabase
      .from("student_events")
      .select("student_id, front_id, students(first_name, last_name)")
      .eq("event_id", eventId)
      .in("student_id", [...studentIds]);
    if (error) throw error;
    for (const r of (data as any[]) || []) {
      studentFrontId.set(r.student_id, r.front_id ?? null);
      const fn = r.students?.first_name ?? "";
      const ln = r.students?.last_name ?? "";
      studentName.set(r.student_id, `${fn} ${ln}`.trim() || null);
    }
  }

  // Resolve scan-only takers: scans.taker_id is the front_id (string).
  // For team tests: look up team via teams.front_id. For individual: student_events.front_id.
  // Only the ones not already covered by online/manual lookups need extra round-trips.
  const numericFrontIds = [...scanTakerFrontIds]
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  const scanTeamByFront = new Map<number, { team_id: number; team_name: string | null }>();
  const scanStudentByFront = new Map<
    number,
    { student_id: string; display_name: string | null }
  >();

  if (numericFrontIds.length > 0) {
    if (isTeam) {
      const { data, error } = await supabase
        .from("teams")
        .select("team_id, front_id, team_name")
        .eq("event_id", eventId)
        .in("front_id", numericFrontIds);
      if (error) throw error;
      for (const t of (data as any[]) || []) {
        scanTeamByFront.set(t.front_id, { team_id: t.team_id, team_name: t.team_name ?? null });
        teamFrontId.set(t.team_id, t.front_id);
        teamName.set(t.team_id, t.team_name ?? null);
      }
    } else {
      const { data, error } = await supabase
        .from("student_events")
        .select("student_id, front_id, students(first_name, last_name)")
        .eq("event_id", eventId)
        .in("front_id", numericFrontIds);
      if (error) throw error;
      for (const r of (data as any[]) || []) {
        const fn = r.students?.first_name ?? "";
        const ln = r.students?.last_name ?? "";
        const name = `${fn} ${ln}`.trim() || null;
        scanStudentByFront.set(r.front_id, { student_id: r.student_id, display_name: name });
        studentFrontId.set(r.student_id, r.front_id);
        studentName.set(r.student_id, name);
      }
    }
  }

  const ensureEntity = (key: string, init: () => EntityScore): EntityScore => {
    if (!entities.has(key)) entities.set(key, init());
    return entities.get(key)!;
  };

  // Online takers → key by team_id (team test) or student_id (individual)
  for (const [takerId, info] of takerInfo) {
    let key: string;
    let init: () => EntityScore;
    if (isTeam) {
      const teamId = info.team_id;
      if (teamId == null) {
        key = `taker:${takerId}`;
      } else {
        key = `team:${teamId}`;
      }
      init = () => ({
        front_id: teamId != null ? teamFrontId.get(teamId) ?? null : null,
        entity_type: "team",
        display_name: (teamId != null && teamName.get(teamId)) || info.taker_name || null,
        student_id: null,
        team_id: teamId,
        test_taker_id: takerId,
        totalScore: 0,
        problemCount: 0,
        lastSubmittedAt: null,
        scoreBreakdown: { online: 0, scan: 0, manual: 0 },
        perProblem: {},
      });
    } else {
      const sid = info.student_id;
      if (sid == null) {
        key = `taker:${takerId}`;
      } else {
        key = `student:${sid}`;
      }
      init = () => ({
        front_id: sid != null ? studentFrontId.get(sid) ?? null : null,
        entity_type: "student",
        display_name: (sid != null && studentName.get(sid)) || info.taker_name || null,
        student_id: sid,
        team_id: info.team_id,
        test_taker_id: takerId,
        totalScore: 0,
        problemCount: 0,
        lastSubmittedAt: null,
        scoreBreakdown: { online: 0, scan: 0, manual: 0 },
        perProblem: {},
      });
    }
    const e = ensureEntity(key, init);
    if (e.test_taker_id == null) e.test_taker_id = takerId;
    takerKey.set(takerId, key);
  }

  // Manual graders are always team-keyed.
  for (const teamId of manualTeamIds) {
    const key = `team:${teamId}`;
    const e = ensureEntity(key, () => ({
      front_id: teamFrontId.get(teamId) ?? null,
      entity_type: "team",
      display_name: teamName.get(teamId) ?? null,
      student_id: null,
      team_id: teamId,
      test_taker_id: null,
      totalScore: 0,
      problemCount: 0,
      lastSubmittedAt: null,
      scoreBreakdown: { online: 0, scan: 0, manual: 0 },
      perProblem: {},
    }));
    if (e.front_id == null) e.front_id = teamFrontId.get(teamId) ?? null;
    if (!e.display_name) e.display_name = teamName.get(teamId) ?? null;
    teamKey.set(teamId, key);
  }

  // Scan takers — keyed by their entity (team for team tests, student for individual).
  for (const fidStr of scanTakerFrontIds) {
    const fid = Number(fidStr);
    let key: string;
    if (!Number.isFinite(fid)) {
      key = `scan:${fidStr}`;
      ensureEntity(key, () => ({
        front_id: null,
        entity_type: isTeam ? "team" : "student",
        display_name: fidStr,
        student_id: null,
        team_id: null,
        test_taker_id: null,
        totalScore: 0,
        problemCount: 0,
        lastSubmittedAt: null,
        scoreBreakdown: { online: 0, scan: 0, manual: 0 },
        perProblem: {},
      }));
    } else if (isTeam) {
      const team = scanTeamByFront.get(fid);
      if (team) {
        key = `team:${team.team_id}`;
        ensureEntity(key, () => ({
          front_id: fid,
          entity_type: "team",
          display_name: team.team_name,
          student_id: null,
          team_id: team.team_id,
          test_taker_id: null,
          totalScore: 0,
          problemCount: 0,
          lastSubmittedAt: null,
          scoreBreakdown: { online: 0, scan: 0, manual: 0 },
          perProblem: {},
        }));
      } else {
        // Scan exists for a front_id we couldn't resolve. Keep it anyway.
        key = `team_front:${fid}`;
        ensureEntity(key, () => ({
          front_id: fid,
          entity_type: "team",
          display_name: null,
          student_id: null,
          team_id: null,
          test_taker_id: null,
          totalScore: 0,
          problemCount: 0,
          lastSubmittedAt: null,
          scoreBreakdown: { online: 0, scan: 0, manual: 0 },
          perProblem: {},
        }));
      }
    } else {
      const s = scanStudentByFront.get(fid);
      if (s) {
        key = `student:${s.student_id}`;
        ensureEntity(key, () => ({
          front_id: fid,
          entity_type: "student",
          display_name: s.display_name,
          student_id: s.student_id,
          team_id: null,
          test_taker_id: null,
          totalScore: 0,
          problemCount: 0,
          lastSubmittedAt: null,
          scoreBreakdown: { online: 0, scan: 0, manual: 0 },
          perProblem: {},
        }));
      } else {
        key = `student_front:${fid}`;
        ensureEntity(key, () => ({
          front_id: fid,
          entity_type: "student",
          display_name: null,
          student_id: null,
          team_id: null,
          test_taker_id: null,
          totalScore: 0,
          problemCount: 0,
          lastSubmittedAt: null,
          scoreBreakdown: { online: 0, scan: 0, manual: 0 },
          perProblem: {},
        }));
      }
    }
    scanKey.set(fidStr, key);
  }

  return { takerKey, teamKey, scanKey, entities };
}

/**
 * Apply a problem score to an entity, dealing with multi-source overlap.
 * If both online and scan exist for the same problem, prefer scan (since the
 * paper is the canonical artifact for in-person events). Otherwise additive.
 *
 * In practice this overlap is rare, but worth being explicit about so analysts
 * can reason about hybrid tests.
 */
function applyProblemScore(entity: EntityScore, ps: ProblemScore) {
  const existing = entity.perProblem[ps.test_problem_id];
  if (existing) {
    // Source priority: scan > manual > online (paper / authoritative manual wins).
    const priority: Record<ScoreSource, number> = { scan: 3, manual: 2, online: 1 };
    if (priority[ps.source] <= priority[existing.source]) return;
    // Replacing — back out the old contribution.
    entity.scoreBreakdown[existing.source] -= existing.points;
    entity.totalScore -= existing.points;
    entity.problemCount -= 1;
  }
  entity.perProblem[ps.test_problem_id] = ps;
  entity.scoreBreakdown[ps.source] += ps.points;
  entity.totalScore += ps.points;
  entity.problemCount += 1;
  if (ps.lastEditedAt && (!entity.lastSubmittedAt || ps.lastEditedAt > entity.lastSubmittedAt)) {
    entity.lastSubmittedAt = ps.lastEditedAt;
  }
}

export async function resolveTestScores(
  supabase: SupabaseClient,
  testId: number
): Promise<TestScores> {
  const { data: testInfo, error: tErr } = await supabase
    .from("tests")
    .select("test_id, event_id, is_team")
    .eq("test_id", testId)
    .single();
  if (tErr) throw tErr;
  if (testInfo.event_id == null)
    throw new Error(`Test ${testId} has no event_id and cannot be authorized.`);

  const { data: problems, error: pErr } = await supabase
    .from("test_problems")
    .select("test_problem_id, problem_number, page_number, points")
    .eq("test_id", testId)
    .order("problem_number");
  if (pErr) throw pErr;
  const problemMap = new Map<number, TestProblemRow>();
  for (const p of (problems as any[]) || []) {
    problemMap.set(p.test_problem_id, {
      test_problem_id: p.test_problem_id,
      problem_number: p.problem_number,
      page_number: p.page_number,
      points: p.points,
    });
  }

  const [onlineByTaker, manualByTeam, scanByFront] = await Promise.all([
    loadOnlineScores(supabase, testId, problemMap),
    loadManualScores(supabase, testId, problemMap),
    loadScanScores(supabase, testId, problemMap),
  ]);

  const sources: ScoreSource[] = [];
  if (onlineByTaker.size > 0) sources.push("online");
  if (scanByFront.byTakerFrontId.size > 0) sources.push("scan");
  if (manualByTeam.size > 0) sources.push("manual");

  const { takerKey, teamKey, scanKey, entities } = await buildEntityIndex(
    supabase,
    testId,
    testInfo.event_id,
    !!testInfo.is_team,
    [...onlineByTaker.keys()],
    [...manualByTeam.keys()],
    scanByFront.takerFrontIds
  );

  for (const [takerId, problems] of onlineByTaker) {
    const key = takerKey.get(takerId);
    if (!key) continue;
    const e = entities.get(key);
    if (!e) continue;
    for (const ps of problems) applyProblemScore(e, ps);
  }
  for (const [teamId, problems] of manualByTeam) {
    const key = teamKey.get(teamId);
    if (!key) continue;
    const e = entities.get(key);
    if (!e) continue;
    for (const ps of problems) applyProblemScore(e, ps);
  }
  for (const [fid, problems] of scanByFront.byTakerFrontId) {
    const key = scanKey.get(fid);
    if (!key) continue;
    const e = entities.get(key);
    if (!e) continue;
    for (const ps of problems) applyProblemScore(e, ps);
  }

  const list = [...entities.values()].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.lastSubmittedAt && b.lastSubmittedAt) {
      return a.lastSubmittedAt < b.lastSubmittedAt ? -1 : 1;
    }
    if (a.lastSubmittedAt) return -1;
    if (b.lastSubmittedAt) return 1;
    return 0;
  });

  return {
    testId,
    isTeam: !!testInfo.is_team,
    sources,
    problems: (problems as any[] | null)?.map((p: any) => ({
      test_problem_id: p.test_problem_id,
      problem_number: p.problem_number,
      page_number: p.page_number,
      points: p.points ?? 0,
    })) ?? [],
    entities: list,
  };
}
