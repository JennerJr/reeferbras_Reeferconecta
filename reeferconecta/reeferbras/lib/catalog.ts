import carrierParts from "@/data/carrier.json";
import daikinParts from "@/data/daikin.json";
import starcoolParts from "@/data/starcool.json";
import thermokingParts from "@/data/thermoking.json";
import outrosParts from "@/data/outros.json";

type RawCatalogEntry = { linha?: string; setor?: string; componente: string; descricao: string; imagem?: string };
export type CatalogEntry = RawCatalogEntry & { fabricante: string };

export const fabricantes = ["Carrier", "Daikin", "Star Cool", "Thermo King", "Outros"] as const;

function tagFabricante(parts: RawCatalogEntry[], fabricante: string): CatalogEntry[] {
  return parts.map((part) => ({ ...part, fabricante }));
}

export const catalogParts: CatalogEntry[] = [
  ...tagFabricante(carrierParts as RawCatalogEntry[], "Carrier"),
  ...tagFabricante(daikinParts as RawCatalogEntry[], "Daikin"),
  ...tagFabricante(starcoolParts as RawCatalogEntry[], "Star Cool"),
  ...tagFabricante(thermokingParts as RawCatalogEntry[], "Thermo King"),
  ...tagFabricante(outrosParts as RawCatalogEntry[], "Outros"),
];

// Normaliza variações de grafia (acentos, pontuação, espaços) para comparar setores com segurança.
export function normalizeSetor(value?: string) {
  return value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
}

export const setorTabs = [
  { value: "labeletrica", label: "Laboratório de Elétrica" },
  { value: "labeletronica", label: "Laboratório de Eletrônica" },
  { value: "cereco", label: "Centro de Recondicionamento de Compressores" },
] as const;

// `extraParts` permite incluir peças cadastradas dinamicamente (via MongoDB, ver lib/catalog-store.ts)
// sem acoplar este módulo client-safe ao driver do Mongo.
export function getSetorForComponente(nome?: string, extraParts: CatalogEntry[] = []): string {
  if (!nome?.trim()) return "";
  const allParts = extraParts.length ? [...catalogParts, ...extraParts] : catalogParts;
  const match = allParts.find((part) => part.descricao === nome || part.componente === nome);
  return normalizeSetor(match?.setor);
}

// Lista as peças do catálogo disponíveis para um setor (e, opcionalmente, um fabricante específico).
export function getPartsForSetor(setor: string, fabricante?: string, extraParts: CatalogEntry[] = []): CatalogEntry[] {
  const target = normalizeSetor(setor);
  const allParts = extraParts.length ? [...catalogParts, ...extraParts] : catalogParts;
  const seen = new Set<string>();
  const parts: CatalogEntry[] = [];
  for (const part of allParts) {
    if (normalizeSetor(part.setor) !== target) continue;
    if (fabricante && part.fabricante !== fabricante) continue;
    const key = part.descricao.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts.sort((first, second) => first.descricao.localeCompare(second.descricao));
}
