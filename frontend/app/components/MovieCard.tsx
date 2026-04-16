/**
 * MovieCard.tsx — Movie Entry Card with Favicon
 */
"use client";

import Link from "next/link";
import type { Entry } from "../lib/types";
import { DeleteButton } from "./DeleteButton";

interface MovieCardProps {
  data: Entry;
}

export function MovieCard({ data }: MovieCardProps) {
  return (
    <article className="entry-card movie">
      <DeleteButton url={data.url} />
      <div className="entry-content">
        <div className="entry-type">Movie</div>
        <h2 className="entry-title">
          <Link href={data.url} target="_blank" rel="noopener noreferrer">
            {data.title}
          </Link>
        </h2>
        {(data.year || data.duration) && (
          <div className="entry-year">
            {data.year}{data.year && data.duration ? " · " : ""}{data.duration}
          </div>
        )}
        {data.excerpt && <p className="entry-excerpt">{data.excerpt}</p>}
        <div className="entry-meta">
          <Link
            href={data.url}
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
        </div>
      </div>
    </article>
  );
}
