import Link from "next/link";

export default function NotFound() {
  return (
    <section className="prose max-w-none">
      <p className="font-mono text-sm text-muted">E486: Pattern not found</p>
      <h1>Page not found</h1>
      <p>The page you requested doesn’t exist (or hasn’t been published yet).</p>
      <p>
        <Link href="/">Back to the latest issue</Link> ·{" "}
        <Link href="/issues/">Browse the archive</Link>
      </p>
    </section>
  );
}
