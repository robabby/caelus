import type { Metadata } from "next";
import { SITE } from "./site";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: `/${string}`;
  type?: "website" | "article";
  noIndex?: boolean;
};

export function absoluteUrl(path: `/${string}`): string {
  return `${SITE.url}${path}`;
}

export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const resolvedTitle = path === "/" ? SITE.title : `${title} · ${SITE.name}`;
  const robots = noIndex
    ? {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      }
    : undefined;

  return {
    title: path === "/" ? { absolute: SITE.title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE.name,
      url: absoluteUrl(path),
      title: resolvedTitle,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
    },
    ...(robots ? { robots } : {}),
  };
}
