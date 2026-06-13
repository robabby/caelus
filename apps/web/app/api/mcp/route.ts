/**
 * Hosted MCP endpoint: the same caelus chart tools as the `caelus-mcp` stdio
 * server, mounted on MCP Streamable HTTP at /api/mcp.
 *
 * Transport: the SDK's Web Standard transport (Request -> Response), run
 * STATELESS -- no session id, JSON responses (no SSE). On serverless every
 * request may land on a different instance, so a fresh server+transport per
 * request is the correct model; the transport disables session validation when
 * `sessionIdGenerator` is undefined, and the protocol layer doesn't gate on a
 * prior `initialize`, so `initialize`, `tools/list`, and `tools/call` each work
 * as independent POSTs.
 *
 * Data: the embedded tier (a bundled JS object, like /api/chart), injected into
 * buildServer(). It carries every body the seven tools touch and needs no
 * filesystem, so nothing has to be traced into the function bundle.
 */
import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import caelusPkg from "caelus/package.json";
import accuracySwiss from "caelus/accuracy.json";

export const runtime = "nodejs"; // caelus-mcp imports node:fs/url/module
export const dynamic = "force-dynamic";
export const maxDuration = 30; // event-search tools can take a beat

// One engine for the lifetime of the warm instance: it holds no per-request
// state, only computation caches, so it is safe to share across requests.
const engine = new Engine(embeddedData);

// caelus-mcp normally reads its version and the accuracy table from disk at
// runtime. In this serverless bundle those reads don't resolve (the file
// tracer can't follow them), so we inject the data via static package imports
// instead -- webpack bundles these deterministically. Version is lockstep
// across the four packages, so caelus's version is caelus-mcp's. The jpl
// (Horizons) table isn't a package export, so it stays null here; the validation
// (swiss) table is the one that matters and ships as caelus/accuracy.json.
const VERSION: string = (caelusPkg as { version: string }).version;
const ACCURACY = { swiss: accuracySwiss, jpl: null };

const TOOLS = [
  "natal_chart", "current_sky", "transits", "synastry",
  "find_aspect_dates", "rectification_grid", "sky_events",
] as const;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** Browser/crawler-friendly description; MCP clients POST JSON-RPC instead. */
export function GET(): Response {
  return Response.json(
    {
      name: "caelus",
      version: VERSION,
      transport: "streamable-http",
      endpoint: "https://www.ephemengine.com/api/mcp",
      stateless: true,
      tools: TOOLS,
      resources: ["caelus://glossary", "caelus://accuracy"],
      prompts: ["rectification_session"],
      hint: "POST MCP JSON-RPC 2.0 requests (initialize, tools/list, tools/call) to this URL.",
      docs: "https://www.ephemengine.com/docs/mcp",
    },
    { headers: CORS },
  );
}

async function handle(req: Request): Promise<Response> {
  try {
    // Dynamic import keeps caelus-mcp (and the SDK transport) off the module's
    // static graph, so they load on first request rather than at build/prerender.
    // Kept inside the try so a load failure becomes a JSON-RPC error, not an
    // empty-body 500 that escapes before we can shape a response.
    const [{ buildServer }, { WebStandardStreamableHTTPServerTransport }] = await Promise.all([
      import("caelus-mcp"),
      import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"),
    ]);

    const server = buildServer(engine, { version: VERSION, accuracy: ACCURACY });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: no session, no in-memory store
      enableJsonResponse: true,      // buffered JSON responses instead of SSE
    });

    await server.connect(transport);
    return withCors(await transport.handleRequest(req));
  } catch (err) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" },
        id: null,
      },
      { status: 500, headers: CORS },
    );
  }
}

export { handle as POST, handle as DELETE };
