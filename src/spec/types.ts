/**
 * TypeScript type definitions embedded in the execute tool description
 * so the AI can write correctly-typed code.
 */
export const TYPE_DEFINITIONS = `
## Type Definitions

> **front_id** (on Student, StudentEvent, Team): user-facing numeric ID shown on badges / scorecards / rosters. When the user says "team 31" or "student 142" they mean front_id. Always report back to the user using front_id + name, never internal IDs.

interface Event {
  event_id: number;
  event_name: string;
  event_date: string;           // YYYY-MM-DD
  host_id: number;
  ticket_price_cents: number;
  max_team_size: number;
  published: boolean;
  reg_frozen: boolean;
  email: string | null;
  logo: string | null;
  summary: string | null;
  waivers: any | null;
  payment_provider_event_internal_id: string | null;
  host?: Host;
}

interface Host {
  host_id: number;
  host_name: string;
  email: string | null;
  logo: string | null;
  styles: any | null;
}

interface Student {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  grade: number | null;
}

interface StudentEvent {
  student_event_id: number;
  student_id: string;
  event_id: number;
  team_id: number | null;
  org_id: number | null;
  front_id: number | null;     // ⭐ user-facing ID — always use this when reporting
  waiver: string | null;
  created_at: string;
  person?: Student;              // joined from students table
  team?: Team;
  org_event?: OrgEvent;
}

interface Team {
  team_id: number;
  team_name: string | null;
  event_id: number;
  org_id: number | null;
  join_code: string | null;
  front_id: number | null;     // ⭐ user-facing ID — always use this when reporting
  invites: string[] | null;
  members?: StudentEvent[];      // populated by SDK
}

interface Org {
  org_id: number;
  name: string;
  address: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
}

interface OrgEvent {
  org_event_id: number;
  org_id: number;
  event_id: number;
  join_code: string | null;
  invites: string[] | null;
  org?: Org;
  event?: Event;
}

interface Coach {
  coach_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface OrgCoach {
  org_id: number;
  coach_id: string;
  person?: Coach;
}

interface TicketOrder {
  id: number;
  event_id: number;
  student_id: string | null;
  org_id: number | null;
  quantity: number;
  order_id: string | null;
  ticket_service: "stripe" | "eventbrite" | "admin" | "humanitix";
  created_at: string;
  refund_requests?: RefundRequest[];
}

interface RefundRequest {
  id: number;
  ticket_id: number;
  quantity: number;
  refund_status: "PENDING" | "APPROVED" | "DENIED";
  request_reason: string | null;
  response_reason: string | null;
  created_at: string;
}

interface Test {
  test_id: number;
  test_name: string;
  event_id: number;
  is_team: boolean;
  visible: boolean;
  test_mode: "Standard" | "Puzzle" | "Guts" | "Meltdown";
  start_time: string | null;
  end_time: string | null;
  length: number | null;
  division: string | null;
}

interface TestTaker {
  test_taker_id: number;
  test_id: number;
  student_id: string | null;
  team_id: number | null;
  score: number | null;
  start_time: string | null;
  end_time: string | null;
  front_id?: number | null;      // enriched for individual tests
}

interface GradedTestAnswer {
  test_answer_id: number | null;
  test_id: number | null;
  test_taker_id: number | null;
  test_problem_id: number | null;
  test_problem_number: number | null;
  test_problem_page: number | null;
  test_name: string | null;
  answer_latex: string | null;    // the student's submitted answer
  score: number | null;
  points: number | null;          // max points for the problem
  correct: boolean | null;
  last_edited_time: string | null; // ISO timestamp of the last edit to this answer
}

interface TestProblem {
  test_problem_id: number;
  test_id: number;
  problem_id: number;
  problem_number: number;
  points: number | null;
  page_number: number | null;
}

interface CustomField {
  custom_field_id: number;
  key: string;
  label: string;
  custom_field_type: "text" | "number" | "date" | "paragraph" | "email" | "phone" | "multiple_choice" | "checkboxes" | "dropdown";
  custom_field_table: "students" | "teams" | "orgs";
  choices: string[] | null;
  required: boolean;
  hidden: boolean;
}
`;
