/**
 * loading.tsx — Loading Skeleton for the Vault Page
 * ===================================================
 *
 * WHAT IS loading.tsx?
 *   When a Server Component (like EntriesGrid) needs to fetch data,
 *   there's a delay between the user navigating to the page and
 *   the data being ready. During this delay, Next.js shows the
 *   loading.tsx component as a placeholder.
 *
 * HOW IT WORKS (React Suspense):
 *   Next.js wraps your page in a <Suspense> boundary:
 *
 *   <Suspense fallback={<Loading />}>
 *     <Page />
 *   </Suspense>
 *
 *   While <Page /> is waiting for its async data (the await fetch
 *   in EntriesGrid), React shows <Loading /> instead.
 *
 *   Once the data is ready, React "streams" the real content in
 *   and replaces the loading skeleton. No flickering, no blank page.
 *
 * WHAT IS A SKELETON?
 *   A skeleton is a "wireframe preview" of the real content.
 *   Instead of a spinner (which tells you nothing about what's coming),
 *   a skeleton shows the SHAPE of what the content will look like.
 *
 *   Users perceive skeleton UIs as faster than spinners because
 *   their brain starts processing the layout before the data arrives.
 *   (This is backed by UX research from Facebook and Google.)
 *
 *   The pulsing animation makes it feel "alive" — something is
 *   happening, data is loading, be patient.
 */

export default function Loading() {
  return (
    <div>
      {/* Hero section skeleton */}
      <header className="hero">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
        <div className="skeleton skeleton-input" />
      </header>

      {/* Entries grid skeleton */}
      <section className="entries-section">
        <div className="entries-header">
          <div className="skeleton" style={{ width: "80px", height: "12px" }} />
          <div className="skeleton" style={{ width: "60px", height: "12px" }} />
        </div>
        <div className="entries-grid">
          {/* Generate 6 skeleton cards with varying heights */}
          {[200, 160, 240, 180, 220, 170].map((height, i) => (
            <div
              key={i}
              className="skeleton skeleton-card"
              style={{ height: `${height}px` }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
