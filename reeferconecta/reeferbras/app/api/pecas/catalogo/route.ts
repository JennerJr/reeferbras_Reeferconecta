import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { canManagePieces } from "@/lib/authorization";
import {
  addCustomCatalogPart,
  deleteCustomCatalogPart,
  getAllCatalogParts,
  getCustomCatalogParts,
  hideStaticCatalogPart,
} from "@/lib/catalog-store";

const fabricantesValidos = ["Carrier", "Daikin", "Star Cool", "Thermo King", "Outros"];
const setores = ["lab.elétrica", "lab.eletronica", "cereco"];

// GET /api/pecas/catalogo — por padrão lista só as peças cadastradas dinamicamente (salvas no MongoDB),
// opcionalmente filtradas por fabricante (?fabricante=Carrier). Com ?all=1, retorna o catálogo completo
// (peças de fábrica + dinâmicas), usado pela tela "Peças cadastradas".
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ erro: "Sessão não encontrada" }, { status: 401 });

    if (request.nextUrl.searchParams.get("all")) {
      const parts = await getAllCatalogParts();
      return NextResponse.json({ parts }, { status: 200 });
    }

    const fabricante = request.nextUrl.searchParams.get("fabricante") ?? undefined;
    const parts = await getCustomCatalogParts(fabricante);
    return NextResponse.json({ parts }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/pecas/catalogo] erro ao listar:", error);
    return NextResponse.json({ erro: "Não foi possível carregar o catálogo." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ erro: "Sessão não encontrada" }, { status: 401 });
    if (!canManagePieces(user.role)) return NextResponse.json({ erro: "Sem permissão para cadastrar peças." }, { status: 403 });

    const body = (await request.json()) as { fabricante?: string; setor?: string; componente?: string; imagem?: string };
    const fabricante = body.fabricante?.trim() ?? "";
    const setor = body.setor?.trim() ?? "";
    const componente = body.componente?.trim() ?? "";
    const imagem = body.imagem?.trim() || undefined;

    if (!fabricantesValidos.includes(fabricante)) return NextResponse.json({ erro: "Fabricante inválido." }, { status: 400 });
    if (!setores.includes(setor)) return NextResponse.json({ erro: "Setor inválido." }, { status: 400 });
    if (!componente) return NextResponse.json({ erro: "Informe o componente." }, { status: 400 });

    const newPart = await addCustomCatalogPart({
      linha: "Container",
      fabricante,
      setor,
      componente,
      descricao: componente,
      ...(imagem ? { imagem } : {}),
    });

    return NextResponse.json({ parte: newPart }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pecas/catalogo] erro ao cadastrar:", error);
    return NextResponse.json({ erro: "Não foi possível cadastrar a peça." }, { status: 500 });
  }
}

// DELETE /api/pecas/catalogo — remove uma peça do catálogo.
// Peças cadastradas dinamicamente (source "custom") são removidas do MongoDB; peças de fábrica
// (source "static", vindas dos JSON bundlados) são apenas ocultadas, já que não podem ser
// apagadas do disco em produção.
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ erro: "Sessão não encontrada" }, { status: 401 });
    if (!canManagePieces(user.role)) return NextResponse.json({ erro: "Sem permissão para excluir peças." }, { status: 403 });

    const body = (await request.json()) as { source?: string; id?: string; fabricante?: string; descricao?: string };

    if (body.source === "custom") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ erro: "ID da peça inválido." }, { status: 400 });
      const deleted = await deleteCustomCatalogPart(id);
      if (!deleted) return NextResponse.json({ erro: "Peça não encontrada." }, { status: 404 });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (body.source === "static") {
      const fabricante = body.fabricante?.trim();
      const descricao = body.descricao?.trim();
      if (!fabricante || !descricao) return NextResponse.json({ erro: "Dados inválidos para exclusão." }, { status: 400 });
      await hideStaticCatalogPart(fabricante, descricao);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ erro: "Origem da peça inválida." }, { status: 400 });
  } catch (error) {
    console.error("[DELETE /api/pecas/catalogo] erro ao excluir:", error);
    return NextResponse.json({ erro: "Não foi possível excluir a peça." }, { status: 500 });
  }
}

