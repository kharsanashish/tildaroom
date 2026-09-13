import { createFileRoute } from "@tanstack/react-router";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/bill/$billId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!UUID_PATTERN.test(params.billId)) {
          return new Response("Bill not found", { status: 404 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: reading, error } = await supabaseAdmin
            .from("meter_readings")
            .select("flat_id, month, year")
            .eq("id", params.billId)
            .maybeSingle();

          if (error || !reading) {
            return new Response("Bill not found", { status: 404 });
          }

          const path = `${reading.flat_id}/${reading.year}-${String(reading.month).padStart(2, "0")}.pdf`;
          const { data: signedData, error: signedError } = await supabaseAdmin
            .storage
            .from("bill-pdfs")
            .createSignedUrl(path, 60 * 10);

          if (signedError || !signedData?.signedUrl) {
            return new Response("Bill PDF not found", { status: 404 });
          }

          return Response.redirect(signedData.signedUrl, 302);
        } catch (error) {
          console.error("Bill redirect failed", error);
          return new Response("Bill unavailable", { status: 503 });
        }
      },
    },
  },
});