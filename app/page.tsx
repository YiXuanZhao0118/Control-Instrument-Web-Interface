// /app/page.tsx
import Link from "next/link";
import { listPagesMeta } from "@/lib/dataStore";

export default async function Home() {
  const pages = await listPagesMeta(); // 從 Data.json 列出全部
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Pages</h1>
      <ul className="mt-4 space-y-2">
        {pages.map((p) => (
          <li key={p.id} className="border rounded p-3">
            <Link href={`/instruments/${p.id}`} className="hover:underline">
              {p.title || "(untitled)"}{" "}
              <span className="text-slate-500">#{p.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
