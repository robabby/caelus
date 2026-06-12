import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./dist/src/server.js", import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map(t => t.name).join(", "));

const natal = await client.callTool({ name: "natal_chart", arguments: {
  date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } });
const c = JSON.parse(natal.content[0].text);
console.log("natal sun:", c.bodies.sun.pos, "house", c.bodies.sun.house, "| asc:", c.angles.ascPos);
console.log("aspects:", c.aspects.length, "| payload:", natal.content[0].text.length, "chars");

const dates = await client.callTool({ name: "find_aspect_dates", arguments: {
  body: "saturn", aspect: "square", target_lon: c.bodies.moon.lon,
  start: "2026-01-01T00:00:00Z", end: "2030-01-01T00:00:00Z" } });
console.log("saturn square natal moon hits:", JSON.parse(dates.content[0].text).hits);

const rect = await client.callTool({ name: "rectification_grid", arguments: {
  date: "1990-06-10T00:00:00Z", lat: 27.95, lon: -82.46, step_minutes: 30 } });
const rg = JSON.parse(rect.content[0].text);
console.log("asc sign changes:", rg.asc_sign_changes.slice(0, 4).join(" | "), "...");

await client.close();
