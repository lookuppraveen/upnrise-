"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MODE_LABELS, type PlayerMode } from "@/lib/roleplay/additional-settings";

type MediaDev = { deviceId: string; label: string };

export type PreSessionModalProps = {
  open: boolean;
  onClose: () => void;
  trainingId: string;
  moduleId: string;
  moduleName: string;
  scenario: string;
  keywords: string[];
  minDurationMin: number;
  maxDurationMin: number;
  attemptsKind: "unlimited" | "limited";
  attemptsLimit: number;
  attemptsUsed: number;
  hintsKind: "yes" | "no" | "limited";
  hintsLimit: number;
  availableModes: PlayerMode[];
  availableLanguages: string[];
};

export function PreSessionModal({
  open,
  onClose,
  trainingId,
  moduleId,
  moduleName,
  scenario,
  keywords,
  minDurationMin,
  maxDurationMin,
  attemptsKind,
  attemptsLimit,
  attemptsUsed,
  hintsKind,
  hintsLimit,
  availableModes,
  availableLanguages,
}: PreSessionModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [lang, setLang] = useState(availableLanguages[0] ?? "English");
  const [mode, setMode] = useState<PlayerMode>(availableModes[0] ?? "video");

  const [mics, setMics] = useState<MediaDev[]>([]);
  const [speakers, setSpeakers] = useState<MediaDev[]>([]);
  const [micId, setMicId] = useState("default");
  const [speakerId, setSpeakerId] = useState("default");
  const [micLevel, setMicLevel] = useState(0);
  const [micGranted, setMicGranted] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setMicLevel(0);
      setMicGranted(false);
      return;
    }
    setLang(availableLanguages[0] ?? "English");
    setMode(availableModes[0] ?? "video");
  }, [open, availableLanguages, availableModes]);

  useEffect(() => {
    if (!open || step !== 2) return;

    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicGranted(true);

        const devices = await navigator.mediaDevices.enumerateDevices();
        const micDevices = devices.filter((d) => d.kind === "audioinput");
        const spkDevices = devices.filter((d) => d.kind === "audiooutput");

        setMics(
          micDevices.map((d, i) => ({
            deviceId: d.deviceId || "default",
            label: d.label || `Microphone ${i + 1}`,
          })),
        );
        setSpeakers(
          spkDevices.map((d, i) => ({
            deviceId: d.deviceId || "default",
            label: d.label || `Speaker ${i + 1}`,
          })),
        );
        if (micDevices[0]) setMicId(micDevices[0].deviceId || "default");
        if (spkDevices[0]) setSpeakerId(spkDevices[0].deviceId || "default");

        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyzer = ctx.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        analyzerRef.current = analyzer;

        function tick() {
          if (!analyzerRef.current || cancelled) return;
          const buf = new Uint8Array(analyzerRef.current.frequencyBinCount);
          analyzerRef.current.getByteFrequencyData(buf);
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
          setMicLevel(Math.min(100, (avg / 128) * 200));
          animFrameRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        setMics([{ deviceId: "default", label: "Default Microphone" }]);
        setSpeakers([{ deviceId: "default", label: "Default Speaker" }]);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyzerRef.current = null;
    };
  }, [open, step]);

  function handleStart() {
    const params = new URLSearchParams();
    params.set("lang", lang);
    params.set("mode", mode);
    router.push(`/learn/trainings/${trainingId}/modules/${moduleId}/play?${params.toString()}`);
    onClose();
  }

  function handleTestSpeaker() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // ignore
    }
  }

  if (!open) return null;

  const attemptsLabel =
    attemptsKind === "unlimited"
      ? "Unlimited attempts"
      : `${attemptsUsed} of ${attemptsLimit} attempt${attemptsLimit === 1 ? "" : "s"} used`;

  const hintsLabel =
    hintsKind === "no"
      ? "No hints available"
      : hintsKind === "yes"
        ? "Hints enabled"
        : `Up to ${hintsLimit} hint${hintsLimit === 1 ? "" : "s"}`;

  const modeOptions: { value: PlayerMode; label: string }[] = availableModes.map((m) => ({
    value: m,
    label: MODE_LABELS[m],
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full bg-surface border border-border flex flex-col"
        style={{
          maxWidth: 540,
          maxHeight: "90vh",
          borderRadius: "var(--r-lg, 14px)",
          boxShadow: "var(--shadow-md, 0 8px 32px rgba(0,0,0,0.18))",
          overflowY: "auto",
        }}
      >
        <button
          suppressHydrationWarning
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-3 hover:text-ink transition-colors"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 pt-5 pb-2 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
              Step {step} of 2
            </span>
            <div className="flex gap-1">
              <div
                className="h-[3px] w-6 rounded-full"
                style={{ background: step >= 1 ? "var(--accent, #e85d3a)" : "var(--border, #e0dbd4)" }}
              />
              <div
                className="h-[3px] w-6 rounded-full"
                style={{ background: step >= 2 ? "var(--accent, #e85d3a)" : "var(--border, #e0dbd4)" }}
              />
            </div>
          </div>
          <h2 className="font-display text-[22px] leading-tight -tracking-[0.01em]">
            {step === 1 ? "Session Briefing" : "Setup Your Session"}
          </h2>
          <p className="text-[12px] text-ink-3 mt-0.5 truncate">{moduleName}</p>
        </div>

        {step === 1 ? (
          <StepOneBriefing
            scenario={scenario}
            keywords={keywords}
            minDurationMin={minDurationMin}
            maxDurationMin={maxDurationMin}
            attemptsLabel={attemptsLabel}
            hintsLabel={hintsLabel}
            onExit={onClose}
            onNext={() => setStep(2)}
          />
        ) : (
          <StepTwoSetup
            availableLanguages={availableLanguages}
            lang={lang}
            onLangChange={setLang}
            modeOptions={modeOptions}
            mode={mode}
            onModeChange={setMode}
            mics={mics}
            micId={micId}
            onMicChange={setMicId}
            micLevel={micLevel}
            micGranted={micGranted}
            speakers={speakers}
            speakerId={speakerId}
            onSpeakerChange={setSpeakerId}
            onTestSpeaker={handleTestSpeaker}
            onPrev={() => setStep(1)}
            onStart={handleStart}
          />
        )}
      </div>
    </div>
  );
}

function StepOneBriefing({
  scenario,
  keywords,
  minDurationMin,
  maxDurationMin,
  attemptsLabel,
  hintsLabel,
  onExit,
  onNext,
}: {
  scenario: string;
  keywords: string[];
  minDurationMin: number;
  maxDurationMin: number;
  attemptsLabel: string;
  hintsLabel: string;
  onExit: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="px-6 py-5 space-y-5 flex-1">
        {scenario ? (
          <section>
            <SectionLabel>Scenario</SectionLabel>
            <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-1.5">{scenario}</p>
          </section>
        ) : null}

        <section>
          <SectionLabel>Duration</SectionLabel>
          <div className="flex gap-2 mt-1.5">
            <Pill>Min: {minDurationMin} min</Pill>
            <Pill>Max: {maxDurationMin} min</Pill>
          </div>
        </section>

        {keywords.length > 0 ? (
          <section>
            <SectionLabel>Keywords to Cover ({keywords.length})</SectionLabel>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-[11.5px] font-medium text-ink-2 border border-border rounded-full px-3 py-[3px]"
                  style={{ background: "var(--surface-2)" }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <InfoRow icon="history" label="Attempts" value={attemptsLabel} />
          <InfoRow icon="ai-sparkle" label="Hints" value={hintsLabel} />
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
        <Button variant="ghost" size="md" onClick={onExit} suppressHydrationWarning>
          Exit
        </Button>
        <Button variant="accent" size="md" onClick={onNext} suppressHydrationWarning>
          Next
          <Icon name="chevron-right" size={14} />
        </Button>
      </div>
    </>
  );
}

function StepTwoSetup({
  availableLanguages,
  lang,
  onLangChange,
  modeOptions,
  mode,
  onModeChange,
  mics,
  micId,
  onMicChange,
  micLevel,
  micGranted,
  speakers,
  speakerId,
  onSpeakerChange,
  onTestSpeaker,
  onPrev,
  onStart,
}: {
  availableLanguages: string[];
  lang: string;
  onLangChange: (l: string) => void;
  modeOptions: { value: PlayerMode; label: string }[];
  mode: PlayerMode;
  onModeChange: (m: PlayerMode) => void;
  mics: MediaDev[];
  micId: string;
  onMicChange: (id: string) => void;
  micLevel: number;
  micGranted: boolean;
  speakers: MediaDev[];
  speakerId: string;
  onSpeakerChange: (id: string) => void;
  onTestSpeaker: () => void;
  onPrev: () => void;
  onStart: () => void;
}) {
  return (
    <>
      <div className="px-6 py-5 space-y-5 flex-1">
        {availableLanguages.length > 1 ? (
          <section>
            <SectionLabel>Language</SectionLabel>
            <div className="flex flex-wrap gap-2 mt-2">
              {availableLanguages.map((l) => (
                <label
                  key={l}
                  className="flex items-center gap-2 cursor-pointer text-[13px] text-ink select-none"
                >
                  <RadioDot checked={lang === l} onChange={() => onLangChange(l)} />
                  {l}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {modeOptions.length > 1 ? (
          <section>
            <SectionLabel>Session Mode</SectionLabel>
            <div className="space-y-2 mt-2">
              {modeOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer text-[13px] text-ink select-none"
                >
                  <RadioDot checked={mode === opt.value} onChange={() => onModeChange(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </section>
        ) : modeOptions.length === 1 ? (
          <section>
            <SectionLabel>Session Mode</SectionLabel>
            <p className="text-[13px] text-ink-2 mt-1.5">{modeOptions[0].label}</p>
          </section>
        ) : null}

        <section>
          <SectionLabel>Microphone</SectionLabel>
          <div className="mt-1.5 space-y-2">
            <DeviceSelect
              devices={mics.length > 0 ? mics : [{ deviceId: "default", label: "Default Microphone" }]}
              value={micId}
              onChange={onMicChange}
            />
            <div className="flex items-center gap-2">
              <div
                className="flex-1 h-[6px] rounded-full overflow-hidden"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-75"
                  style={{
                    width: `${micLevel}%`,
                    background: micLevel > 80 ? "var(--bad, #c5392f)" : "var(--good, #2a7d4f)",
                  }}
                />
              </div>
              <span className="text-[10.5px] font-mono text-ink-3 shrink-0 w-8">
                {micGranted ? `${Math.round(micLevel)}%` : "—"}
              </span>
            </div>
            {!micGranted ? (
              <p className="text-[11px] text-ink-3">Microphone access needed for level preview</p>
            ) : null}
          </div>
        </section>

        <section>
          <SectionLabel>Speaker / Headphones</SectionLabel>
          <div className="mt-1.5 space-y-2">
            <DeviceSelect
              devices={speakers.length > 0 ? speakers : [{ deviceId: "default", label: "Default Speaker" }]}
              value={speakerId}
              onChange={onSpeakerChange}
            />
            <button
              suppressHydrationWarning
              onClick={onTestSpeaker}
              className="text-[12px] font-medium text-ink-2 border border-border rounded-sm px-3 py-[5px] hover:bg-surface-2 hover:text-ink transition-colors"
            >
              Test Speaker
            </button>
          </div>
        </section>
      </div>

      <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
        <Button variant="ghost" size="md" onClick={onPrev} suppressHydrationWarning>
          <Icon name="chevron-right" size={14} className="rotate-180" />
          Previous
        </Button>
        <Button variant="accent" size="md" onClick={onStart} suppressHydrationWarning>
          Start Session
          <Icon name="play" size={13} />
        </Button>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[12px] font-medium text-ink border border-border rounded-full px-3 py-[4px]"
      style={{ background: "var(--surface-2)" }}
    >
      {children}
    </span>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: "history" | "ai-sparkle";
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] border border-border p-3"
      style={{ background: "var(--surface-2)" }}
    >
      <Icon name={icon} size={15} className="text-ink-3 mt-[1px] shrink-0" />
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{label}</div>
        <div className="text-[12.5px] text-ink mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function RadioDot({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      suppressHydrationWarning
      type="button"
      onClick={onChange}
      className="w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors"
      style={{
        borderColor: checked ? "var(--accent, #e85d3a)" : "var(--border, #e0dbd4)",
        background: "var(--surface)",
      }}
    >
      {checked ? (
        <div
          className="w-[9px] h-[9px] rounded-full"
          style={{ background: "var(--accent, #e85d3a)" }}
        />
      ) : null}
    </button>
  );
}

function DeviceSelect({
  devices,
  value,
  onChange,
}: {
  devices: MediaDev[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[12.5px] text-ink border border-border rounded-sm px-3 py-[7px] bg-surface outline-none focus:ring-2 focus:ring-accent/30"
    >
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label}
        </option>
      ))}
    </select>
  );
}
