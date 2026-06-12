import BirthForm from "../components/BirthForm";
import TodayStrip from "../components/TodayStrip";

export default function Home() {
  return (
    <main>
      <h1 style={{ letterSpacing: "0.05em" }}>natal chart</h1>
      <p style={{ opacity: 0.7 }}>
        Enter a birth as the person would state it — local clock time, place.
        Timezone resolution (DST, historical rules, wartime offsets) is handled
        by <a href="https://www.npmjs.com/package/caelus-birth" style={{ color: "#8a7fd4" }}>caelus-birth</a>;
        positions compute client-side with{" "}
        <a href="https://www.npmjs.com/package/caelus" style={{ color: "#8a7fd4" }}>caelus</a>.
      </p>
      <BirthForm />
      <TodayStrip />
    </main>
  );
}
