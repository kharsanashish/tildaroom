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
            .select("*")
            .eq("id", params.billId)
            .maybeSingle();

          if (error || !reading) {
            return new Response("Bill not found", { status: 404 });
          }

          // Build the bill fresh from current database values so it never shows a
          // stale unit price (the saved PDF may have been made while the rate was 0).
          try {
            const [{ data: flat }, { data: rateRow }, { data: settings }] = await Promise.all([
              supabaseAdmin.from("flats").select("flat_number, tenant_name, tenant_mobile").eq("id", reading.flat_id).maybeSingle(),
              supabaseAdmin.from("electricity_rates").select("rate_per_unit").eq("month", reading.month).eq("year", reading.year).maybeSingle(),
              supabaseAdmin.from("settings").select("owner_name, owner_mobile").eq("id", 1).maybeSingle(),
            ]);

            if (flat) {
              const { createReadingPdf } = await import("@/lib/pdf");
              const { roundBillAmount } = await import("@/lib/billing");
              const monthRate = Number(rateRow?.rate_per_unit ?? 0);
              let r: any = { ...reading };
              if (r.curr_reading != null && monthRate > 0 && Number(r.rate_per_unit) !== monthRate) {
                const units = Math.max(0, Number(r.curr_reading) - Number(r.prev_reading));
                const elec = units * monthRate;
                r = {
                  ...r,
                  units,
                  rate_per_unit: monthRate,
                  electricity_bill: elec,
                  total_due: roundBillAmount(
                    Number(r.rent) + Number(r.maintenance ?? 0) + Number(r.other_charges) + elec - Number(r.opening_balance),
                  ),
                };
              }
              const doc = createReadingPdf({
                reading: r,
                flatNumber: flat.flat_number,
                tenantName: flat.tenant_name || "Tenant",
                tenantMobile: flat.tenant_mobile,
                ownerName: settings?.owner_name || undefined,
                ownerMobile: settings?.owner_mobile || undefined,
              });
              const buf = doc.output("arraybuffer");
              return new Response(buf, {
                status: 200,
                headers: {
                  "Content-Type": "application/pdf",
                  "Content-Disposition": `inline; filename="Bill_${reading.year}-${String(reading.month).padStart(2, "0")}.pdf"`,
                  "Cache-Control": "no-store",
                },
              });
            }
          } catch (genError) {
            console.error("Fresh bill generation failed, falling back to stored PDF", genError);
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
