/**
 * page.tsx — Home Page (Server Component)
 * ==========================================
 *
 * UPDATED ARCHITECTURE:
 *   Before: page.tsx → EntriesGrid (server component that fetches + renders)
 *   After:  page.tsx → fetches data → passes to VaultContent (client)
 *
 *   Why the change?
 *   We need search filtering (useState) which requires a Client Component.
 *   But data fetching needs a Server Component (await fetch).
 *
 *   Solution: page.tsx (Server) fetches the data, then passes it
 *   as props to VaultContent (Client) which handles search + rendering.
 *
 *   This is the "fetch on server, render on client" pattern:
 *     Server: const data = await getEntries();
 *     Client: <VaultContent entries={data} />
 */

import { getEntries } from "./lib/api";
import FeedForm from "./components/FeedForm";
import VaultContent from "./components/VaultContent";

export default async function Home() {
  // Fetch entries on the server (no API call from browser)
  // If this throws, error.tsx catches it
  const entries = await getEntries();

  return (
    <div>
      <header className="hero">
        <h1>Your personal knowledge vault</h1>
        <p>A curated archive of ideas worth preserving</p>
        <FeedForm />
      </header>
      <VaultContent entries={entries} />
    </div>
  );
}
