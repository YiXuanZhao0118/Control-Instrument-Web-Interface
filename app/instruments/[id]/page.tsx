// app/instruments/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import { getPageTitle, getPageState } from "@/lib/dataStore";

export default async function InstrumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // ← 這裡要 await

  // 導向對應的動態頁
  if (id === "0") redirect("/admin");
  if (id === "1") redirect(`/wavemeter/${id}`);
  if (id === "2") redirect(`/usb3104-analog/${id}`);
  if (id === "3") redirect(`/spincore/${id}`);

  // 其它 id：顯示原始 JSON
  const title = await getPageTitle(id);
  const state = await getPageState(id);
  if (!title || state === undefined) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">一般資料檢視頁（顯示原始內容）：</p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
          <pre className="text-sm text-slate-800 overflow-auto">
            {JSON.stringify(state, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
