import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PLACES_WHATSAPP_TEMPLATE, validPlacesWhatsAppTemplate } from "./whatsapp-template";

export async function loadPlacesWhatsAppTemplate() {
  try {
    const client = await createClient();
    const { data } = await client.from("places_whatsapp_settings").select("template").eq("id", true).maybeSingle();
    return validPlacesWhatsAppTemplate(data?.template) ? data.template : DEFAULT_PLACES_WHATSAPP_TEMPLATE;
  } catch { return DEFAULT_PLACES_WHATSAPP_TEMPLATE; }
}
