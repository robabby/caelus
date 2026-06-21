import Link from "next/link";
import { notFound } from "next/navigation";
import ApiMarkdown from "../../../../components/ApiMarkdown";
import { Eyebrow } from "../../../../components/Prose";
import { listApiDocs, readApiDoc, apiTitle } from "../../../../lib/api-docs";
import { pageMetadata } from "../../../../lib/seo";

export function generateStaticParams() {
  return listApiDocs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = `${apiTitle(slug)} · API`;
  return pageMetadata({
    title,
    description: `Generated TypeScript API reference for ${apiTitle(slug)} in the caelus package.`,
    path: `/docs/api/${slug}`,
  });
}

export default async function ApiSymbol({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = readApiDoc(slug);
  if (content === null) notFound();
  return (
    <>
      <Eyebrow>
        <Link href="/docs/api">API Reference</Link> / {apiTitle(slug)}
      </Eyebrow>
      <ApiMarkdown content={content} />
    </>
  );
}
