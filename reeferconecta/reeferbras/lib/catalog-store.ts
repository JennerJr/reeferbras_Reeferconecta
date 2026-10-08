import { ObjectId, type WithId } from "mongodb";
import getMongoClient from "@/lib/mongodb";
import { catalogParts as staticCatalogParts, type CatalogEntry } from "@/lib/catalog";

// Módulo server-only: peças de catálogo cadastradas dinamicamente pelos usuários.
// Mantido separado de lib/catalog.ts (que é importado por componentes client) para não
// acoplar o driver do MongoDB a bundles de navegador.
export type CustomCatalogPart = CatalogEntry & { createdAt: string };
export type CatalogListItem = CatalogEntry & { source: "static" | "custom"; id?: string };
type HiddenCatalogMarker = { fabricante: string; descricao: string; hiddenAt: string };

const PIECES_DATABASE = process.env.MONGODB_DATABASE_PECAS || "pecas";
const CATALOG_COLLECTION = "catalogodb";
const HIDDEN_COLLECTION = "catalogoocultodb";

async function catalogCollection() {
  const client = await getMongoClient();
  return client.db(PIECES_DATABASE).collection<CustomCatalogPart>(CATALOG_COLLECTION);
}

async function hiddenCollection() {
  const client = await getMongoClient();
  return client.db(PIECES_DATABASE).collection<HiddenCatalogMarker>(HIDDEN_COLLECTION);
}

function toCustomPart(doc: WithId<CustomCatalogPart>): CustomCatalogPart & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}

function hiddenKey(fabricante: string, descricao: string) {
  return `${fabricante}::${descricao.trim().toLowerCase()}`;
}

export async function getCustomCatalogParts(fabricante?: string): Promise<(CustomCatalogPart & { id: string })[]> {
  const collection = await catalogCollection();
  const query = fabricante ? { fabricante } : {};
  const docs = await collection.find(query).sort({ descricao: 1 }).toArray();
  return docs.map(toCustomPart);
}

export async function addCustomCatalogPart(
  part: Omit<CustomCatalogPart, "createdAt">,
): Promise<CustomCatalogPart & { id: string }> {
  const collection = await catalogCollection();
  const doc: CustomCatalogPart = { ...part, createdAt: new Date().toISOString() };
  const result = await collection.insertOne(doc);
  return { ...doc, id: result.insertedId.toString() };
}

// Remove definitivamente uma peça cadastrada dinamicamente (salva no MongoDB).
export async function deleteCustomCatalogPart(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await catalogCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

// Peças do catálogo "de fábrica" (arquivos JSON bundlados) não podem ser apagadas do disco em produção;
// em vez disso, marcamos como ocultas para que não apareçam mais nas listagens.
export async function hideStaticCatalogPart(fabricante: string, descricao: string): Promise<void> {
  const collection = await hiddenCollection();
  const descricaoNormalizada = descricao.trim().toLowerCase();
  await collection.updateOne(
    { fabricante, descricao: descricaoNormalizada },
    { $setOnInsert: { fabricante, descricao: descricaoNormalizada, hiddenAt: new Date().toISOString() } },
    { upsert: true },
  );
}

// Lista o catálogo completo (peças de fábrica + cadastradas dinamicamente), já sem as ocultadas,
// usado pela tela "Peças cadastradas" (separada por fabricante).
export async function getAllCatalogParts(): Promise<CatalogListItem[]> {
  const [custom, hiddenDocs] = await Promise.all([
    getCustomCatalogParts(),
    (await hiddenCollection()).find({}).toArray(),
  ]);
  const hiddenKeys = new Set(hiddenDocs.map((doc) => hiddenKey(doc.fabricante, doc.descricao)));
  const staticItems: CatalogListItem[] = staticCatalogParts
    .filter((part) => !hiddenKeys.has(hiddenKey(part.fabricante, part.descricao)))
    .map((part) => ({ ...part, source: "static" }));
  const customItems: CatalogListItem[] = custom.map((part) => ({ ...part, source: "custom", id: part.id }));
  return [...staticItems, ...customItems].sort((first, second) => first.descricao.localeCompare(second.descricao));
}
