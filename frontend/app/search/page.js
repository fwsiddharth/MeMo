import { Suspense } from "react";
import SearchPageClient from "../../components/SearchPageClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading search...</div>}>
      <SearchPageClient />
    </Suspense>
  );
}
