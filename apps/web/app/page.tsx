import SkyNow from "../components/SkyNow";
import { A, Nav } from "../components/Prose";

export default function Home() {
  const a = { color: "#8a7fd4" };
  return (
    <main>
      <Nav current="/" />
      <h1 style={{ letterSpacing: "0.05em" }}>caelus</h1>
      <p style={{ opacity: 0.7 }}>
        ~85 KB ephemeris in the browser. Positions from published theories, checked to
        ~1″ vs Swiss Ephemeris (<A href="/validation">tables</A>,{" "}
        <A href="/provenance">sources</A>). MIT.
      </p>
      <SkyNow />
      <p style={{ marginTop: "2rem", display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
        <a style={a} href="https://www.npmjs.com/package/caelus">npm install caelus</a>
        <a style={a} href="https://github.com/heavyblotto/caelus">GitHub</a>
        <a style={a} href="/api/chart?lat=27.94&lon=-82.46">REST API</a>
        <a style={a} href="https://www.npmjs.com/package/caelus-mcp">MCP server</a>
      </p>
    </main>
  );
}
