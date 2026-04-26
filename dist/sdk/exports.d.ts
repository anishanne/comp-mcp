import { SupabaseClient } from "@supabase/supabase-js";
export declare function createExportsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** Export student list */
    students(eventId: number, format?: "json" | "csv"): Promise<string | {
        student_event_id: any;
        front_id: any;
        student_id: any;
        first_name: any;
        last_name: any;
        email: any;
        grade: any;
        team_id: any;
        org_id: any;
        waiver: string;
    }[]>;
    /** Export teams with members */
    teams(eventId: number, format?: "json" | "csv"): Promise<string | {
        team_id: any;
        team_name: any;
        org_id: any;
        join_code: any;
        front_id: any;
    }[]>;
    /** Export organizations */
    orgs(eventId: number, format?: "json" | "csv"): Promise<string | {
        org_event_id: any;
        org_id: any;
        org_name: any;
        address: any;
        join_code: any;
    }[]>;
    /** Export ticket orders */
    ticketOrders(eventId: number, format?: "json" | "csv"): Promise<string | {
        id: any;
        student_id: any;
        org_id: any;
        quantity: any;
        order_id: any;
        ticket_service: any;
        created_at: any;
    }[]>;
    /** Export refund requests */
    refundRequests(eventId: number, format?: "json" | "csv"): Promise<string | {
        refund_id: any;
        ticket_id: any;
        quantity: any;
        status: any;
        request_reason: any;
        response_reason: any;
        created_at: any;
    }[]>;
};
