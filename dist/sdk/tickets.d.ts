import { SupabaseClient } from "@supabase/supabase-js";
export declare function createTicketsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** List all ticket orders for an event */
    listOrders(eventId: number): Promise<any[]>;
    /** Get a specific ticket order */
    getOrder(ticketId: number): Promise<any>;
    /** List refund requests for an event, optionally filtered by status */
    listRefundRequests(eventId: number, status?: "PENDING" | "APPROVED" | "DENIED"): Promise<any[]>;
    /** Get a specific refund request */
    getRefundRequest(refundId: number): Promise<any>;
    /**
     * Approve a pending refund (DB-only, no payment processing).
     * NOTE: Actual payment refund via Stripe/Eventbrite/Humanitix must be done manually by admin.
     */
    approveRefund(refundId: number, quantity: number, responseMessage?: string): Promise<any>;
    /** Deny a pending refund */
    denyRefund(refundId: number, responseMessage?: string): Promise<any>;
    /** Calculate total revenue for an event */
    getEventRevenue(eventId: number): Promise<{
        ticketPriceCents: any;
        totalSold: number;
        totalRefunded: number;
        netTickets: number;
        grossRevenueCents: number;
        refundedCents: number;
        netRevenueCents: number;
    }>;
};
