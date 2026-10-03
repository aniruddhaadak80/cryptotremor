import type { Metadata } from "next";
import { AgentConsole } from "@/components/agent-console";
import { GitHubLink } from "@/components/github-link";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Agent console",
  description:
    "Call Cryptotremor's ten typed MCP tools over live JSON-RPC 2.0: read, analyse, mutate, verify and share, with full request and response payloads.",
  alternates: { canonical: `${SITE.liveUrl}/agent` },
};

export default function AgentPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Agent interface</p>
          <h1 className="mt-2 text-3xl font-semibold">Ten tools over live JSON-RPC 2.0</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
            An MCP-style endpoint with the full handshake: <code className="tabular text-copper-300">initialize</code>,
            {" "}<code className="tabular text-copper-300">tools/list</code> and{" "}
            <code className="tabular text-copper-300">tools/call</code>. The mutating tools write
            through the same service layer and the same seal chain as the interface — an agent cannot
            change state the UI cannot see.
          </p>
        </div>
        <GitHubLink variant="secondary" label="View the route source" />
      </header>

      <AgentConsole />
    </div>
  );
}