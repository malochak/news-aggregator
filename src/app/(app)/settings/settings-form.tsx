"use client";

import { useState, useSyncExternalStore } from "react";
import { useFormAction } from "@/components/use-form-action";
import { saveSettings, testAi } from "@/app/actions";

const noop = () => () => {};

type Provider = { id: string; label: string; defaultModel: string; needsBaseUrl?: boolean };

export function SettingsForm({
  providers,
  instanceDefault,
  emailEnabled,
  initial,
}: {
  providers: Provider[];
  instanceDefault: string | null;
  emailEnabled: boolean;
  initial: {
    aiProvider: string;
    aiModel: string;
    aiBaseUrl: string;
    hasKey: boolean;
    timezone: string;
    digestEnabled: boolean;
    digestHour: number;
    autoArchiveDays: number;
  };
}) {
  const settings = useFormAction(saveSettings, { resetOnSuccess: false });
  const tester = useFormAction(testAi, { resetOnSuccess: false });
  const [provider, setProvider] = useState(initial.aiProvider);
  // Default to the browser's timezone the first time.
  const browserTimezone = useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
  const [timezone, setTimezone] = useState<string | null>(initial.timezone || null);
  const selected = providers.find((p) => p.id === provider);

  return (
    <form onSubmit={settings.onSubmit} className="space-y-14">
      <section>
        <h2 className="mb-1 font-serif text-2xl">Summaries</h2>
        <p className="mb-6 text-sm text-graphite">
          Bring your own key. It is stored encrypted and only used to summarize your items.
          {instanceDefault && ` Leave empty to use this instance's default (${instanceDefault}).`}
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="meta">Provider</span>
            <select
              name="aiProvider"
              className="field"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="">{instanceDefault ? "Instance default" : "None (no summaries)"}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <label className="block">
                <span className="meta">Model</span>
                <input name="aiModel" className="field" defaultValue={initial.aiModel} placeholder={selected.defaultModel} />
              </label>
              <label className="block">
                <span className="meta">API key</span>
                <input
                  name="aiApiKey"
                  type="password"
                  autoComplete="off"
                  className="field"
                  placeholder={initial.hasKey ? "•••••••• stored — type to replace" : selected.needsBaseUrl ? "Optional" : "Paste key"}
                />
              </label>
              {selected.needsBaseUrl && (
                <label className="block sm:col-span-2">
                  <span className="meta">Base URL</span>
                  <input
                    name="aiBaseUrl"
                    className="field"
                    defaultValue={initial.aiBaseUrl}
                    placeholder="http://localhost:11434/v1"
                  />
                </label>
              )}
              {initial.hasKey && (
                <label className="flex items-center gap-2 text-sm text-graphite">
                  <input type="checkbox" name="clearKey" className="accent-[var(--accent)]" /> Remove stored key
                </label>
              )}
            </>
          )}
        </div>
        {selected && (
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              className="btn"
              disabled={tester.pending}
              onClick={(e) => tester.run(e.currentTarget.form)}
            >
              {tester.pending ? "Testing…" : "Test connection"}
            </button>
            {tester.state && (
              <p className={`text-sm ${tester.state.error ? "text-accent" : "text-done"}`}>
                {tester.state.error ?? tester.state.ok}
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-6 font-serif text-2xl">Inbox</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="meta">Auto-archive untouched items after (days, 0 = never)</span>
            <input name="autoArchiveDays" type="number" min={0} max={365} className="field" defaultValue={initial.autoArchiveDays} />
          </label>
          <label className="block">
            <span className="meta">Timezone</span>
            <input name="timezone" className="field" value={timezone ?? browserTimezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-serif text-2xl">Daily email</h2>
        <p className="mb-6 text-sm text-graphite">
          {emailEnabled
            ? "A morning digest of what arrived since the last one."
            : "Email isn't configured on this instance (SMTP_URL, EMAIL_FROM)."}
        </p>
        <div className="grid items-end gap-6 sm:grid-cols-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="digestEnabled"
              defaultChecked={initial.digestEnabled}
              disabled={!emailEnabled}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Send me a daily digest</span>
          </label>
          <label className="block">
            <span className="meta">At</span>
            <select name="digestHour" className="field" defaultValue={initial.digestHour}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4 border-t border-ink pt-6">
        <button className="btn btn-accent" disabled={settings.pending}>
          {settings.pending ? "Saving…" : "Save settings"}
        </button>
        {settings.state && (
          <p className={`text-sm ${settings.state.error ? "text-accent" : "text-done"}`}>
            {settings.state.error ?? settings.state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
