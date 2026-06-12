import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const serverPath = fileURLToPath(new URL("./dist/src/server.js", import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
const client = new Client({ name: "verify", version: "0.0.1" });
await client.connect(transport);
const res = await client.callTool({ name: "find_aspect_dates", arguments: {
  body: "mars", aspect: "sextile", target_lon: 283.283,
  start: "2026-01-01T00:00:00Z", end: "2033-01-01T00:00:00Z" } });
console.log(JSON.parse(res.content[0].text).hits.join("\n"));
await client.close();
