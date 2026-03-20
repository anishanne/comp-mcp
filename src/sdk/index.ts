import { SupabaseClient } from "@supabase/supabase-js";
import { createEventsSDK } from "./events.js";
import { createStudentsSDK } from "./students.js";
import { createTeamsSDK } from "./teams.js";
import { createOrgsSDK } from "./orgs.js";
import { createTicketsSDK } from "./tickets.js";
import { createTestsSDK } from "./tests.js";
import { createAnalyticsSDK } from "./analytics.js";
import { createExportsSDK } from "./exports.js";

export function createAPI(supabase: SupabaseClient, eventIds: number[]) {
  return {
    events: createEventsSDK(supabase, eventIds),
    students: createStudentsSDK(supabase, eventIds),
    teams: createTeamsSDK(supabase, eventIds),
    orgs: createOrgsSDK(supabase, eventIds),
    tickets: createTicketsSDK(supabase, eventIds),
    tests: createTestsSDK(supabase, eventIds),
    analytics: createAnalyticsSDK(supabase, eventIds),
    export: createExportsSDK(supabase, eventIds),
  };
}

export type CompAPI = ReturnType<typeof createAPI>;
