import { envAiConfig, PROVIDERS } from "@/lib/ai/providers";
import { emailEnabled } from "@/lib/email";
import { getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  const instance = envAiConfig();
  return (
    <main className="mx-auto max-w-[760px] px-5 pt-8 sm:px-10 md:pt-14">
      <header className="mb-10 border-b-[3px] border-double border-ink pb-5">
        <p className="meta mb-1">{user.email}</p>
        <h1 className="font-serif text-[2.75rem] leading-none tracking-tight sm:text-6xl">Settings</h1>
      </header>
      <SettingsForm
        providers={Object.entries(PROVIDERS).map(([id, p]) => ({ id, ...p }))}
        instanceDefault={instance ? PROVIDERS[instance.provider].label : null}
        emailEnabled={emailEnabled}
        initial={{
          aiProvider: settings?.aiProvider ?? "",
          aiModel: settings?.aiModel ?? "",
          aiBaseUrl: settings?.aiBaseUrl ?? "",
          hasKey: Boolean(settings?.aiApiKey),
          timezone: settings?.timezone ?? "",
          digestEnabled: settings?.digestEnabled ?? false,
          digestHour: settings?.digestHour ?? 7,
          autoArchiveDays: settings?.autoArchiveDays ?? 7,
        }}
      />
    </main>
  );
}
