// app\admin\page.tsx
"use client";

import { useEffect, useState } from "react";

type Meta = { id: string; title: string };
type Ep = { base: string; instrument: string };

export default function AdminPage() {
  // Page titles
  const [pages, setPages] = useState<Meta[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pageTitle, setPageTitle] = useState("");

  // Endpoints
  const [epList, setEpList] = useState<Record<string, Ep>>({});
  const [epKey, setEpKey] = useState("");
  const [epBase, setEpBase] = useState("");
  const [epInst, setEpInst] = useState("");

  // Load pages
  useEffect(() => {
    fetch("/api/pages", { cache: "no-store" })
      .then(r => r.json())
      .then((data: Meta[]) => setPages(data))
      .catch(() => {});
  }, []);

  // When page changes, load its meta
  useEffect(() => {
    if (!selectedId) { setPageTitle(""); return; }
    fetch(`/api/page/${selectedId}/meta`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: { id: string; title: string }) => setPageTitle(data.title || ""))
      .catch(() => setPageTitle(""));
  }, [selectedId]);

  async function rename() {
    if (!selectedId) return;
    const res = await fetch(`/api/page/${selectedId}/meta`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: pageTitle }),
    });
    if (!res.ok) { alert("Rename failed"); return; }
    const updated = (await res.json()) as Meta;
    setPages(prev => prev.map(x => x.id === updated.id ? updated : x));
    alert("Renamed!");
  }

  // Load endpoints
  useEffect(() => {
    fetch("/api/endpoints", { cache: "no-store" })
      .then(r => r.ok ? r.json() : {})
      .then((data) => setEpList(data || {}))
      .catch(() => {});
  }, []);

  // When endpoint key changes, fill inputs
  useEffect(() => {
    if (!epKey) { setEpBase(""); setEpInst(""); return; }
    const ep = epList[epKey];
    setEpBase(ep?.base ?? "");
    setEpInst(ep?.instrument ?? "");
  }, [epKey, epList]);

  // 從 PATCH /api/endpoints/[key] 改為 PUT /api/endpoints（後端會逐一 set）
  async function saveEndpoint() {
    if (!epKey) return;
    const body = { [epKey]: { base: epBase, instrument: epInst } };
    const res = await fetch(`/api/endpoints`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { alert("Save endpoint failed"); return; }
    const updatedAll = (await res.json()) as Record<string, Ep>;
    setEpList(updatedAll);
    alert("Saved!");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Admin</h1>

        {/* Page titles card */}
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur space-y-4">
          <h2 className="text-lg font-medium text-slate-800">Page Title</h2>

          <label className="block text-sm text-slate-700">
            Select a page
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="mt-2 w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <option value="">-- choose --</option>
              {pages.map(p => (
                <option key={p.id} value={p.id}>
                  #{p.id} {p.title || "(untitled)"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-700">
            New title
            <input
              value={pageTitle}
              onChange={e => setPageTitle(e.target.value)}
              placeholder="type new title…"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </label>

          <button
            onClick={rename}
            disabled={!selectedId}
            className={`rounded-lg px-4 py-2 text-white shadow-sm ${
              selectedId
                ? "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500"
                : "bg-slate-400"
            } focus:outline-none focus-visible:ring-2`}
          >
            Rename
          </button>
        </section>

        {/* Endpoints card */}
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur space-y-4">
          <h2 className="text-lg font-medium text-slate-800">Endpoints</h2>

          <label className="block text-sm text-slate-700">
            Select endpoint key
            <select
              value={epKey}
              onChange={(e) => setEpKey(e.target.value)}
              className="mt-2 w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <option value="">-- choose --</option>
              {Object.keys(epList).map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-700">
            Or new endpoint key
            <input
              value={epKey}
              onChange={(e) => setEpKey(e.target.value)}
              placeholder="e.g. spincore / daq3104 / wavemeter"
              className="mt-2 w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </label>

          {epKey && (
            <div className="space-y-3">
              <label className="block text-sm text-slate-700">
                Base URL
                <input
                  value={epBase}
                  onChange={(e) => setEpBase(e.target.value)}
                  placeholder="http://172.30.10.18:9999"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
              </label>

              <label className="block text-sm text-slate-700">
                Instrument name
                <input
                  value={epInst}
                  onChange={(e) => setEpInst(e.target.value)}
                  placeholder='例："SpinCore" / "DAQ USB3104" / "Wavemeter"'
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
              </label>

              <button
                onClick={saveEndpoint}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Save Endpoint
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
