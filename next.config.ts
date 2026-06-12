import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// There's a stray package-lock.json one level up at
// design_handoff_upnrise/package-lock.json (left over from an earlier
// install in the wrong dir). Without pinning the root, Turbopack picks
// THAT lockfile and resolves modules against the parent's node_modules
// — where our app's dependencies (e.g. @heygen/liveavatar-web-sdk)
// don't exist, so they fail at runtime with "Cannot find module".
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // The LiveAvatar SDK pulls livekit-client + protobufjs, both of which
  // are browser-only. We only import it from a client effect via a
  // dynamic import(), but Turbopack still walks the graph for SSR and
  // chokes when those transitive deps can't resolve in a Node context.
  // Marking the SDK as a server external skips bundling it on the
  // server side — the client bundle still gets it for the actual
  // runtime call.
  serverExternalPackages: ["@heygen/liveavatar-web-sdk"],
};

export default nextConfig;
