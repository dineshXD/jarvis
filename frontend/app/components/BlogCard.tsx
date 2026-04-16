/**
 * BlogCard.tsx — Blog Entry Card with Favicon
 */
"use client";

import Link from "next/link";
import type { Entry } from "../lib/types";
import { DeleteButton } from "./DeleteButton";

interface BlogCardProps {
  data: Entry;
}

export function BlogCard({ data }: BlogCardProps) {
  return (
    <article className={`entry-card blog ${data.featured ? "featured" : ""}`}>
      <DeleteButton url={data.url} />
      <div className="entry-type">Blog</div>
      <h2 className="entry-title">
        <Link href={data.url} target="_blank" rel="noopener noreferrer">
          {data.title}
        </Link>
      </h2>
      {data.excerpt && <p className="entry-excerpt">{data.excerpt}</p>}
      <div className="entry-meta">
        <Link
          href={`https://${data.source}`}
          target="_blank"
          rel="noopener noreferrer"
          className="entry-source"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${data.source}&sz=16`}
            alt=""
            width={14}
            height={14}
            className="source-favicon"
          />
          {data.source}
        </Link>
        <span className="entry-date">{data.date}</span>
      </div>
    </article>
  );
}
