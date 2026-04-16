/**
 * TweetCard.tsx — Tweet Entry Card with Favicon
 */
"use client";

import { useState } from "react";
import type { Entry } from "../lib/types";
import { DeleteButton } from "./DeleteButton";

interface TweetCardProps {
  data: Entry;
}

export function TweetCard({ data }: TweetCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <article
      className={`entry-card tweet ${isExpanded ? "expanded" : ""}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <DeleteButton url={data.url} />
      <div className="entry-type">Tweet</div>
      <div className="entry-title">{data.author || data.source}</div>
      <p className={`entry-excerpt ${!isExpanded ? "truncated" : ""}`}>
        {data.excerpt}
      </p>
      {!isExpanded && <span className="tweet-expand">Click to expand</span>}
      <div className="entry-meta">
        <span className="entry-source">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${data.source}&sz=16`}
            alt=""
            width={14}
            height={14}
            className="source-favicon"
          />
          {data.source}
        </span>
        <span className="entry-date">{data.date}</span>
      </div>
    </article>
  );
}
