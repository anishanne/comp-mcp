import { SupabaseClient } from "@supabase/supabase-js";
export declare function createOrgsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** List all orgs registered for an event */
    list(eventId: number): Promise<any[]>;
    /** Get org details with coaches */
    get(orgId: number): Promise<any>;
    /** Full org details: coaches, teams, event registration */
    getDetails(orgId: number, eventId: number): Promise<any>;
    /** Get org's teams with members */
    getTeams(orgId: number, eventId: number): Promise<any[]>;
    /** Get net available tickets for an org */
    getTicketCount(eventId: number, orgId: number): Promise<number>;
    /** Get all ticket orders + refund requests for an org */
    getTicketOrders(orgId: number, eventId: number): Promise<any[]>;
    /** Remove student from org (clears org_id and team_id) */
    removeStudent(studentEventId: number): Promise<any>;
};
