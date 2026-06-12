// Master Settings editor — client form for /super/settings.

"use client";

import { useState, useTransition } from "react";
import { saveMasterSettings } from "@/app/super/settings/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Initial = {
  productName: string;
  signupEnabled: boolean;
  defaultRegion: string;
  regions: string[];
  featureFlags: Record<string, boolean | string | number>;
  updatedAt: Date;
};

export function MasterSettingsEditor({ initial }: { initial: Initial }) {
  const [productName, setProductName] = useState(initial.productName);
  const [signupEnabled, setSignupEnabled] = useState(initial.signupEnabled);
  const [defaultRegion, setDefaultRegion] = useState(initial.defaultRegion);
  const [regions, setRegions] = useState<string[]>(initial.regions);
  const [regionInput, setRegionInput] = useState("");
  const [flagKey, setFlagKey] = useState("");
  const [flagValue, setFlagValue] = useState("true");
  const [flags, setFlags] = useState<Record<string, boolean | string | number>>(
    initial.featureFlags,
  );
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addRegion() {
    const r = regionInput.trim().toUpperCase();
    if (!r || regions.includes(r) || regions.length >= 20) return;
    setRegions([...regions, r]);
    setRegionInput("");
  }
  function addFlag() {
    const k = flagKey.trim();
    if (!k || k in flags) return;
    const raw = flagValue.trim();
    const value: boolean | string | number =
      raw === "true"
        ? true
        : raw === "false"
          ? false
          : !isNaN(Number(raw)) && raw !== ""
            ? Number(raw)
            : raw;
    setFlags({ ...flags, [k]: value });
    setFlagKey("");
    setFlagValue("true");
  }
  function removeFlag(k: string) {
    const next = { ...flags };
    delete next[k];
    setFlags(next);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        if (!regions.includes(defaultRegion)) {
          throw new Error("Default region must be in the regions list.");
        }
        await saveMasterSettings({
          productName: productName.trim(),
          signupEnabled,
          defaultRegion,
          regions,
          featureFlags: flags,
        });
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card pad="lg" className="space-y-5">
      {/* Branding */}
      <section className="space-y-3">
        <SectionLabel>Branding</SectionLabel>
        <Field label="Product name">
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className={inputCls}
            suppressHydrationWarning
          />
        </Field>
      </section>

      {/* Signup */}
      <section className="space-y-3">
        <SectionLabel>Signup</SectionLabel>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={signupEnabled}
            onChange={(e) => setSignupEnabled(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-[13px] text-ink">
            Allow self-serve company signup
          </span>
        </label>
        <p className="text-[11.5px] text-ink-3">
          When off, only super-admins can create new tenants. Phase 5 wires the
          public sign-up gate.
        </p>
      </section>

      {/* Regions */}
      <section className="space-y-3">
        <SectionLabel>Regions</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Default region for new tenants">
            <select
              value={defaultRegion}
              onChange={(e) => setDefaultRegion(e.target.value)}
              className={inputCls}
              suppressHydrationWarning
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Active regions">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 text-[11.5px] bg-surface-2 border border-border rounded-sm pl-2 pr-1 py-[2px] font-mono"
                  >
                    {r}
                    <button
                      type="button"
                      onClick={() =>
                        setRegions(regions.filter((x) => x !== r))
                      }
                      disabled={regions.length <= 1}
                      className={cn(
                        "px-1",
                        regions.length <= 1
                          ? "text-ink-3/40"
                          : "text-ink-3 hover:text-ink",
                      )}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRegion();
                  }
                }}
                placeholder="Add region (e.g. LATAM)"
                className={cn(inputCls, "font-mono")}
                suppressHydrationWarning
              />
            </div>
          </Field>
        </div>
      </section>

      {/* Feature flags */}
      <section className="space-y-3">
        <SectionLabel>Feature flags</SectionLabel>
        <p className="text-[11.5px] text-ink-3 -mt-1">
          Free-form key/value flags. The app can read{" "}
          <span className="font-mono">platformSettings.featureFlags[key]</span>{" "}
          wherever gating matters.
        </p>
        {Object.keys(flags).length === 0 ? (
          <p className="text-[12px] text-ink-3 font-mono">No flags set.</p>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(flags).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center gap-2 text-[12.5px] font-mono bg-surface-2 border border-border rounded-md px-2.5 py-1.5"
              >
                <span className="text-ink">{k}</span>
                <span className="text-ink-3">=</span>
                <span className="text-accent">{String(v)}</span>
                <button
                  type="button"
                  onClick={() => removeFlag(k)}
                  className="ml-auto text-ink-3 hover:text-bad text-[11px]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[1fr_140px_auto] gap-2 items-end">
          <Field label="Key">
            <input
              value={flagKey}
              onChange={(e) => setFlagKey(e.target.value)}
              placeholder="enableVoiceMode"
              className={cn(inputCls, "font-mono")}
              suppressHydrationWarning
            />
          </Field>
          <Field label="Value">
            <input
              value={flagValue}
              onChange={(e) => setFlagValue(e.target.value)}
              placeholder="true / false / number / string"
              className={cn(inputCls, "font-mono")}
              suppressHydrationWarning
            />
          </Field>
          <Button
            variant="secondary"
            size="md"
            onClick={addFlag}
            disabled={!flagKey.trim()}
          >
            Add
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        {error ? (
          <span className="text-[11.5px] text-bad font-mono">{error}</span>
        ) : savedAt ? (
          <span className="text-[11.5px] text-good font-mono">Saved</span>
        ) : (
          <span className="text-[11.5px] text-ink-3 font-mono">
            Last updated {new Date(initial.updatedAt).toLocaleString()}
          </span>
        )}
        <Button variant="accent" size="md" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </Card>
  );
}

const inputCls =
  "w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
