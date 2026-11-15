import { isAIConfigured } from "@/lib/ai-config.server";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "jinling-impressions", aiConfigured: isAIConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
