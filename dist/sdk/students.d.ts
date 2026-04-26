import { SupabaseClient } from "@supabase/supabase-js";
export declare function createStudentsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** List students for an event with optional pagination and team/org info */
    list(eventId: number, options?: {
        limit?: number;
        offset?: number;
        withDetails?: boolean;
    }): Promise<({
        error: true;
    } & ("Unexpected input: " | "Unexpected input: , team:teams(*), org_event:org_events(*, org:orgs(*))"))[]>;
    /** Get student event details (team, org, waiver) */
    get(studentId: string, eventId: number): Promise<any>;
    /**
     * Resolve a student by front_id (the user-facing ID shown on badges/scorecards).
     * Returns the full student_event record with person/team/org joins, or null.
     */
    getByFrontId(eventId: number, frontId: number): Promise<any>;
    /** Search students by name, email, or front_id */
    search(params: {
        eventId: number;
        name?: string;
        email?: string;
        frontId?: number;
    }): Promise<any[]>;
    /** Get students not assigned to teams */
    getWithoutTeam(eventId: number): Promise<any[]>;
    /** Get student's ticket order + refund status */
    getTicketOrder(studentId: string, eventId: number): Promise<any>;
    /** Get net available tickets for a student */
    getAvailableTickets(studentId: string, eventId: number): Promise<number>;
    /** Move student to a team */
    transferToTeam(studentEventId: number, teamId: number): Promise<any>;
    /** Move student to an org (removes team affiliation) */
    transferToOrg(studentEventId: number, orgId: number): Promise<any>;
    /** Remove student from team (keep event registration) */
    removeFromTeam(studentEventId: number): Promise<any>;
    /** Delete student registration from event */
    removeFromEvent(studentEventId: number): Promise<{
        success: boolean;
    }>;
};
