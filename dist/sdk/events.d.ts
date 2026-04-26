import { SupabaseClient } from "@supabase/supabase-js";
export declare function createEventsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** List configured events (filtered to COMP_EVENT_IDS) */
    list(): Promise<any[]>;
    /** Get event details with host info */
    get(eventId: number): Promise<any>;
    /** Get all tests for an event (admin view — includes hidden) */
    getTests(eventId: number): Promise<any[]>;
    /** Get orgs registered for an event with coaches */
    getOrganizations(eventId: number): Promise<any[]>;
    /** Get all teams for an event */
    getTeams(eventId: number): Promise<any[]>;
    /** Get all students registered for an event */
    getStudents(eventId: number): Promise<any[]>;
    /** Get teams not in any org */
    getIndependentTeams(eventId: number): Promise<any[]>;
    /** Get total tickets sold for an event */
    getTicketCount(eventId: number): Promise<number>;
    /** Get custom fields for the event */
    getCustomFields(eventId: number, table?: "orgs" | "students" | "teams"): Promise<any[]>;
};
