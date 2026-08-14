// Admin · LLM Providers
//
// Tenant CRUD for chat-LLM keys. Only "simple text-gen" routes go through
// this factory today (weekly briefs etc.); the Anthropic-tool-use Copilots
// stay on the platform-default Anthropic key. UI banner spells that out.

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { LlmProvidersManager } from "@/components/admin/LlmProvidersManager";
import { getLlmEnvFallbackKinds } from "@/lib/ai/llm-env-fallback";

export default async function AdminLlmProvidersPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const providers = await prisma.llmProvider.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      label: true,
      apiKey: true,
      baseUrl: true,
      defaultModel: true,
      fastModel: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return (
    <div className="px-7 pt-6 pb-20 max-w-[1100px] space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-[1.05] -tracking-[0.015em]">
          Chat LLM Providers
        </h1>
        <p className="text-ink-2 text-[13.5px] max-w-[680px] leading-[1.5]">
          Add the chat-LLM keys UPnRise should use for weekly briefs and other
          simple text-gen calls scoped to your tenant. Anthropic is the
          platform default; Sarvam AI is available as an OpenAI-compatible
          Indic-first alternative.
        </p>
        <div className="text-[12px] text-ink-3 bg-surface-2 border border-border rounded-md px-3 py-2 max-w-[680px] leading-[1.55]">
          <strong className="text-ink-2 font-semibold">
            Scope note:
          </strong>{" "}
          The Admin/Platform Copilots and roleplay scoring use Anthropic&apos;s
          tool-use protocol directly and stay on the platform Anthropic key
          regardless of what you set here. Only stateless text-gen surfaces
          (weekly briefs, some one-shot generators) route through your
          tenant-scoped provider.
        </div>
      </header>

      <LlmProvidersManager
        providers={providers.map((p) => ({
          id: p.id,
          kind: p.kind,
          label: p.label,
          apiKeyPreview: previewKey(p.apiKey),
          baseUrl: p.baseUrl,
          defaultModel: p.defaultModel,
          fastModel: p.fastModel,
          isDefault: p.isDefault,
          createdAt: p.createdAt.toISOString(),
        }))}
        envFallbackKinds={getLlmEnvFallbackKinds()}
      />
    </div>
  );
}

function previewKey(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(8)}${key.slice(-4)}`;
}
