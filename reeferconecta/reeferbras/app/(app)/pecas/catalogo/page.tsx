"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { canManagePieces } from "@/lib/authorization";
import { fabricantes, normalizeSetor, setorTabs } from "@/lib/catalog";

type CatalogItem = {
  fabricante: string;
  componente: string;
  descricao: string;
  imagem?: string;
  setor?: string;
  linha?: string;
  source: "static" | "custom";
  id?: string;
};

function setorLabel(setor?: string) {
  if (!setor) return "";
  const normalized = normalizeSetor(setor);
  return setorTabs.find((tab) => tab.value === normalized)?.label ?? setor;
}

function keyFor(part: CatalogItem) {
  return part.source === "custom" ? `custom-${part.id}` : `static-${part.fabricante}-${part.descricao}`;
}

export default function CatalogoPecasPage() {
  const [role, setRole] = useState<string>();
  const [loadingRole, setLoadingRole] = useState(true);
  const [parts, setParts] = useState<CatalogItem[]>([]);
  const [loadingParts, setLoadingParts] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string>(fabricantes[0]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => setRole(data.user?.role))
      .catch(() => undefined)
      .finally(() => setLoadingRole(false));

    fetch("/api/pecas/catalogo?all=1")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro ?? "Não foi possível carregar o catálogo.");
        setParts(data.parts ?? []);
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o catálogo."))
      .finally(() => setLoadingParts(false));
  }, []);

  const canManage = canManagePieces(role);

  const partsForTab = useMemo(
    () =>
      parts
        .filter((part) => part.fabricante === activeTab)
        .sort((first, second) => first.descricao.localeCompare(second.descricao)),
    [parts, activeTab],
  );

  async function handleDelete(part: CatalogItem) {
    if (!window.confirm(`Tem certeza que deseja excluir "${part.descricao}"? Essa ação não pode ser desfeita.`)) return;
    const key = keyFor(part);
    setDeletingKey(key);
    setDeleteError("");
    try {
      const response = await fetch("/api/pecas/catalogo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          part.source === "custom"
            ? { source: "custom", id: part.id }
            : { source: "static", fabricante: part.fabricante, descricao: part.descricao },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro ?? "Não foi possível excluir a peça.");
      setParts((current) => current.filter((item) => keyFor(item) !== key));
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : "Não foi possível excluir a peça.");
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="bg-gradient-to-br from-[#E8262C] to-[#B32025] bg-clip-text text-transparent text-sm font-bold uppercase tracking-widest">ReeferConecta</p>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Peças cadastradas</h1>
            <p className="mt-2 text-slate-300">Catálogo de componentes, separado por fabricante.</p>
          </div>
          {!loadingRole && canManage && (
            <Link className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-800 sm:w-auto" href="/pecas/catalogo/novo">
              Cadastrar nova peça
            </Link>
          )}
        </div>

        <div className="mt-6 flex flex-wrap border-b border-slate-700" role="tablist" aria-label="Fabricantes">
          {fabricantes.map((fabricante) => (
            <button
              key={fabricante}
              type="button"
              role="tab"
              aria-selected={activeTab === fabricante}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === fabricante ? "border-sky-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}
              onClick={() => setActiveTab(fabricante)}
            >
              {fabricante}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 rounded-lg bg-red-100 p-3 text-red-700">{error}</p>}
        {deleteError && <p className="mt-4 rounded-lg bg-red-100 p-3 text-red-700">{deleteError}</p>}

        {loadingParts ? (
          <p className="mt-8 text-slate-300">Carregando catálogo...</p>
        ) : partsForTab.length === 0 ? (
          <p className="mt-8 text-slate-300">Nenhuma peça cadastrada para {activeTab}.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partsForTab.map((part) => {
              const key = keyFor(part);
              return (
                <div key={key} className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-gray-800 p-4 shadow-sm">
                  {part.imagem && (
                    // eslint-disable-next-line @next/next/no-img-element -- imagem pode vir de dado externo (base64 ou URL), sem otimização do Next
                    <img className="h-32 w-full rounded-lg border border-slate-600 object-cover" src={part.imagem} alt={part.descricao} />
                  )}
                  <div>
                    <h2 className="font-semibold text-white">{part.descricao}</h2>
                    {part.setor && <p className="mt-1 text-sm text-slate-400">{setorLabel(part.setor)}</p>}
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      className="mt-auto w-fit rounded-lg border border-red-500 px-3 py-1.5 text-sm font-semibold text-red-400 transition hover:bg-red-950 disabled:opacity-50"
                      disabled={deletingKey === key}
                      onClick={() => handleDelete(part)}
                    >
                      {deletingKey === key ? "Excluindo..." : "Excluir"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
