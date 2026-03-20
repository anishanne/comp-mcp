/**
 * TypeScript type definitions embedded in the execute tool description
 * so the AI can write correctly-typed code.
 */
export const TYPE_DEFINITIONS = `
## Type Definitions

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
  front_id: number | null;
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
  front_id: number | null;
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
  test_id: number;
  test_taker_id: number;
  score: number | null;
  test_problem_id: number;
  answer: string | null;
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
