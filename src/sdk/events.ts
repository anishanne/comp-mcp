import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

export function createEventsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** List configured events (filtered to COMP_EVENT_IDS) */
    async list() {
      const { data, error } = await supabase
        .from("events")
        .select("*, host:hosts(*)")
        .in("event_id", eventIds)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data;
    },

    /** Get event details with host info */
    async get(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("events")
        .select("*, host:hosts(*)")
        .eq("event_id", eventId)
        .single();
      if (error) throw error;
      return data;
    },

    /** Get all tests for an event (admin view — includes hidden) */
    async getTests(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("event_id", eventId)
        .order("test_name");
      if (error) throw error;
      return data;
    },

    /** Get orgs registered for an event with coaches */
    async getOrganizations(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("org_events")
        .select(`
          *,
          org:orgs(
            *,
            coaches:org_coaches(
              *,
              person:coaches(*)
            )
          )
        `)
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },

    /** Get all teams for an event */
    async getTeams(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },

    /** Get all students registered for an event */
    async getStudents(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("student_events")
        .select("*, person:students(*)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },

    /** Get teams not in any org */
    async getIndependentTeams(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("event_id", eventId)
        .is("org_id", null);
      if (error) throw error;
      return data;
    },

    /** Get total tickets sold for an event */
    async getTicketCount(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("quantity")
        .eq("event_id", eventId);
      if (error) throw error;
      return data.reduce((sum, order) => sum + order.quantity, 0);
    },

    /** Get custom fields for the event */
    async getCustomFields(eventId: number, table: "orgs" | "students" | "teams" = "students") {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("event_custom_fields")
        .select("*, custom_fields!inner(*)")
        .eq("event_id", eventId)
        .eq("custom_fields.custom_field_table", table)
        .order("ordering");
      if (error) throw error;

      return (data || []).map((record: any) => {
        if (record.custom_fields) {
          record = { ...record, ...record.custom_fields };
          delete record.custom_fields;
        }
        return record;
      });
    },
  };
}
