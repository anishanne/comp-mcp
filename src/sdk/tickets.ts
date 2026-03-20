import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

export function createTicketsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** List all ticket orders for an event */
    async listOrders(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("*, refund_requests(*)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },

    /** Get a specific ticket order */
    async getOrder(ticketId: number) {
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("*, refund_requests(*)")
        .eq("id", ticketId)
        .single();
      if (error) throw error;
      assertEventAllowed(data.event_id, eventIds);
      return data;
    },

    /** List refund requests for an event, optionally filtered by status */
    async listRefundRequests(eventId: number, status?: "PENDING" | "APPROVED" | "DENIED") {
      assertEventAllowed(eventId, eventIds);
      let query = supabase
        .from("refund_requests")
        .select("*, ticket:ticket_orders!inner(*, event_id)")
        .eq("ticket_orders.event_id", eventId);
      if (status) {
        query = query.eq("refund_status", status);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    /** Get a specific refund request */
    async getRefundRequest(refundId: number) {
      const { data, error } = await supabase
        .from("refund_requests")
        .select("*, ticket:ticket_orders(*)")
        .eq("id", refundId)
        .single();
      if (error) throw error;
      return data;
    },

    /**
     * Approve a pending refund (DB-only, no payment processing).
     * NOTE: Actual payment refund via Stripe/Eventbrite/Humanitix must be done manually by admin.
     */
    async approveRefund(refundId: number, quantity: number, responseMessage?: string) {
      // Verify the refund exists and is pending
      const { data: refund, error: refundError } = await supabase
        .from("refund_requests")
        .select("*, ticket:ticket_orders(*)")
        .eq("id", refundId)
        .single();
      if (refundError) throw refundError;
      if (!refund) throw new Error("Refund request not found");
      if (refund.refund_status !== "PENDING") throw new Error("Refund request is not pending");
      if (quantity > refund.quantity) throw new Error("Approved quantity exceeds requested quantity");

      assertEventAllowed(refund.ticket.event_id, eventIds);

      const { data, error } = await supabase
        .from("refund_requests")
        .update({
          quantity,
          refund_status: "APPROVED",
          response_reason: responseMessage || null,
        })
        .eq("id", refundId)
        .select()
        .single();
      if (error) throw error;

      return {
        ...data,
        _warning: `IMPORTANT: The refund status has been marked as APPROVED in the database, but NO money has been returned to the customer yet. The admin must manually process the payment refund through the ${refund.ticket.ticket_service} dashboard for order ${refund.ticket.order_id}.`,
      };
    },

    /** Deny a pending refund */
    async denyRefund(refundId: number, responseMessage?: string) {
      const { data: refund, error: refundError } = await supabase
        .from("refund_requests")
        .select("*, ticket:ticket_orders(*)")
        .eq("id", refundId)
        .single();
      if (refundError) throw refundError;
      if (!refund) throw new Error("Refund request not found");
      if (refund.refund_status !== "PENDING") throw new Error("Refund request is not pending");

      assertEventAllowed(refund.ticket.event_id, eventIds);

      const { data, error } = await supabase
        .from("refund_requests")
        .update({
          refund_status: "DENIED",
          response_reason: responseMessage || null,
        })
        .eq("id", refundId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    /** Calculate total revenue for an event */
    async getEventRevenue(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      // Get event ticket price
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("ticket_price_cents")
        .eq("event_id", eventId)
        .single();
      if (eventError) throw eventError;

      // Total tickets sold
      const { data: orders, error: ordersError } = await supabase
        .from("ticket_orders")
        .select("quantity")
        .eq("event_id", eventId);
      if (ordersError) throw ordersError;
      const totalSold = orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

      // Total refunded
      const { data: refunds, error: refundsError } = await supabase
        .from("refund_requests")
        .select("quantity, ticket_orders!inner(event_id)")
        .eq("refund_status", "APPROVED")
        .eq("ticket_orders.event_id", eventId);
      if (refundsError) throw refundsError;
      const totalRefunded = refunds?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;

      const priceCents = event.ticket_price_cents || 0;

      return {
        ticketPriceCents: priceCents,
        totalSold,
        totalRefunded,
        netTickets: totalSold - totalRefunded,
        grossRevenueCents: totalSold * priceCents,
        refundedCents: totalRefunded * priceCents,
        netRevenueCents: (totalSold - totalRefunded) * priceCents,
      };
    },
  };
}
