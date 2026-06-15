import DocsSidebar from "../../components/DocsSidebar";
import DocsPageFooter from "../../components/DocsPageFooter";
import TableOfContents from "../../components/TableOfContents";
import DocsBreadcrumbs from "../../components/DocsBreadcrumbs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container-wide page">
      <DocsBreadcrumbs />
      <div className="docs-shell">
        <DocsSidebar />
        <article className="docs-content">
          {children}
          <DocsPageFooter />
        </article>
        <TableOfContents />
      </div>
    </main>
  );
}
