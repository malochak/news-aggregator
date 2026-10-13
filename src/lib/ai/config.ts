import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { envAiConfig, type AiConfig } from "./providers";

/** The user's own AI config, falling back to the instance default from env. */
export async function aiConfigFor(userId: string): Promise<AiConfig | null> {
  const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (settings?.aiProvider) {
    return {
      provider: settings.aiProvider,
      model: settings.aiModel,
      baseUrl: settings.aiBaseUrl,
      apiKey: settings.aiApiKey ? decrypt(settings.aiApiKey) : null,
    };
  }
  return envAiConfig();
}
