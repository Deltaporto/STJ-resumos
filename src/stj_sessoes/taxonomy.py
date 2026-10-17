"""Taxonomia oficial do Gabinete (15 matérias), órgãos colegiados e subagente classificador Gemini Flash."""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from stj_sessoes.gemini_client import GeminiClient

logger = logging.getLogger(__name__)

# ==============================================================================
# 1. ÓRGÃOS JULGADORES (Recorte estrito: Primeira Turma e Primeira Seção)
# ==============================================================================

ORGAOS_PUBLICAVEIS: dict[str, str] = {
    "primeira_turma": "Primeira Turma",
    "primeira_secao": "Primeira Seção",
}

REGEX_ORGAOS: dict[str, re.Pattern[str]] = {
    "primeira_turma": re.compile(
        r"\b(?:primeira\s+turma|1\s*[ªa°º]?\s*turma)\b",
        re.IGNORECASE,
    ),
    "primeira_secao": re.compile(
        r"\b(?:primeira\s+se[çc][ãa]o|1\s*[ªa°º]?\s*se[çc][ãa]o)\b",
        re.IGNORECASE,
    ),
}


def remover_acentos(texto: str) -> str:
    """Remove acentuação gráfica mantendo caracteres ASCII equivalentes."""
    if not texto:
        return ""
    normalizado = unicodedata.normalize("NFD", str(texto))
    return "".join(ch for ch in normalizado if unicodedata.category(ch) != "Mn")


def normalizar_chave(texto: str) -> str:
    """Normaliza string para comparação (sem acentos, minúscula, espaços simples)."""
    sem_acentos = remover_acentos(texto).lower()
    limpo = re.sub(r"[^a-z0-9\s/.-]", " ", sem_acentos)
    return re.sub(r"\s+", " ", limpo).strip()


def identificar_orgao(titulo: str) -> str | None:
    """
    Identifica se o título pertence à Primeira Turma ou à Primeira Seção.
    Retorna 'primeira_turma', 'primeira_secao' ou None se for de outro colegiado.
    """
    if not titulo:
        return None
    for slug, padrao in REGEX_ORGAOS.items():
        if padrao.search(titulo):
            return slug
    return None


def nome_orgao_canonico(orgao_slug: str) -> str:
    """Retorna o nome legível do órgão colegiado."""
    return ORGAOS_PUBLICAVEIS.get(orgao_slug, orgao_slug)


# ==============================================================================
# 2. AS 15 MATÉRIAS DO GABINETE (Divisão Oficial)
# ==============================================================================

@dataclass(frozen=True)
class MateriaGabinete:
    id: int
    code: str
    short: str


MATERIAS_GABINETE: tuple[MateriaGabinete, ...] = (
    MateriaGabinete(1, "1. Improbidade Administrativa", "Improbidade Administrativa"),
    MateriaGabinete(2, "2. Desapropriação / Intervenção do Estado", "Desapropriação / Intervenção do Estado"),
    MateriaGabinete(3, "3. Reforma Agrária", "Reforma Agrária"),
    MateriaGabinete(4, "4. Servidor Público Civil e Militar", "Servidor Público Civil e Militar"),
    MateriaGabinete(5, "5. Atos Administrativos", "Atos Administrativos"),
    MateriaGabinete(6, "6. Licitações e Contratos", "Licitações e Contratos"),
    MateriaGabinete(7, "7. Responsabilidade Civil da Administração", "Responsabilidade Civil da Administração"),
    MateriaGabinete(8, "8. Direito Tributário", "Direito Tributário"),
    MateriaGabinete(9, "9. Poder de Polícia (Exceto Ambiental)", "Poder de Polícia (Exceto Ambiental)"),
    MateriaGabinete(10, "10. Ação Civil Pública", "Ação Civil Pública"),
    MateriaGabinete(11, "11. Direito Previdenciário", "Direito Previdenciário"),
    MateriaGabinete(12, "12. Direito Ambiental Urbanístico", "Direito Ambiental Urbanístico"),
    MateriaGabinete(13, "13. Direito dos Povos Indígenas", "Direito dos Povos Indígenas"),
    MateriaGabinete(14, "14. Saúde Pública", "Saúde Pública"),
    MateriaGabinete(15, "15. Direito do Consumidor", "Direito do Consumidor"),
)

MATERIA_POR_ID: dict[int, MateriaGabinete] = {m.id: m for m in MATERIAS_GABINETE}
MATERIA_PADRAO = MATERIA_POR_ID[5]

MINISTROS_TITULARES_1A_SECAO: tuple[str, ...] = (
    "Min. Herman Benjamin",
    "Min. Regina Helena Costa",
    "Min. Gurgel de Faria",
    "Min. Paulo Sérgio Domingues",
    "Min. Benedito Gonçalves",
    "Min. Sérgio Kukina",
    "Min. Francisco Falcão",
    "Min. Mauro Campbell Marques",
    "Min. Teodoro Silva Santos",
    "Min. Afrânio Vilela",
    "Min. Maria Thereza de Assis Moura",
    "Min. Assusete Magalhães",
    "Min. Og Fernandes",
)


def listar_materias_para_prompt() -> str:
    """Formata a lista numerada oficial das 15 matérias para inclusão em prompts."""
    return "\n".join(f"  - {m.code}" for m in MATERIAS_GABINETE)


def listar_ministros_titulares_para_prompt() -> str:
    """Formata a lista de Ministros Titulares da 1ª Turma e 1ª Seção para prompts."""
    return "\n".join(f"  - {nome}" for nome in MINISTROS_TITULARES_1A_SECAO)


def eh_herman_benjamin(texto: str) -> bool:
    """Verifica se o texto faz referência ao Ministro Herman Benjamin."""
    if not texto:
        return False
    norm = normalizar_chave(texto)
    return bool(re.search(r"\b(?:h?erm[aã][nm]\s+benjam[ií][nm]|min(?:istro|\.)\s+h?erman)\b", norm))


def obter_materia_por_id(materia_id: int | str | None) -> dict[str, Any]:
    """Retorna o dicionário canônico da matéria a partir do seu ID (1 a 15)."""
    try:
        mid = int(str(materia_id).strip())
        if mid in MATERIA_POR_ID:
            m = MATERIA_POR_ID[mid]
            return {"id": m.id, "code": m.code, "short": m.short}
    except (TypeError, ValueError):
        pass

    # Caso tenha recebido string como "12. Direito Ambiental Urbanístico"
    texto = str(materia_id or "").strip()
    match_num = re.match(r"^\s*(1[0-5]|[1-9])\b", texto)
    if match_num:
        m = MATERIA_POR_ID[int(match_num.group(1))]
        return {"id": m.id, "code": m.code, "short": m.short}

    chave = normalizar_chave(texto)
    for m in MATERIAS_GABINETE:
        if normalizar_chave(m.short) in chave and chave:
            return {"id": m.id, "code": m.code, "short": m.short}

    return {"id": MATERIA_PADRAO.id, "code": MATERIA_PADRAO.code, "short": MATERIA_PADRAO.short}


# ==============================================================================
# 3. SUBAGENTE CLASSIFICADOR GEMINI FLASH (Matérias 1-15 e Julgadores)
# ==============================================================================

@dataclass(frozen=True)
class JulgadorClassificado:
    name: str
    role: str  # "titular" | "convocado_substituto"
    category_label: str  # "Ministros Titulares" | "Desembargadores Convocados / Substitutos"
    is_herman: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


PROMPT_SUBAGENTE_CLASSIFICADOR_FLASH = """Você é o Subagente Classificador de Taxonomia Jurídica do Gabinete do Ministro Herman Benjamin (Primeira Turma e Primeira Seção do STJ).

Receberá uma lista JSON de julgados extraídos de uma sessão de julgamento. Para CADA julgado (`index`), sua tarefa é classificar com precisão semântica:

1. `materia_id` (inteiro de 1 a 15): escolha a matéria oficial do Gabinete que melhor representa o tema jurídico debatido no julgado, analisando o título, a tese fixada, o resumo da discussão e a matéria bruta anotada:
{lista_materias}

2. `relatores` (lista de objetos): analise o campo `raw_relator` (e, se necessário, o resumo da discussão) para identificar o(s) relator(es) ou prolator(es) do voto condutor, classificando cada um em:
   - **Ministros Titulares da 1ª Turma e da 1ª Seção** (`role`: `"titular"`, `category_label`: `"Ministros Titulares"`): corrija eventuais erros fonéticos de transcrição (como "Erman Benjamim", "Sergio Cucina", "Gurgel de Farias") e use EXATAMENTE a grafia canônica da lista abaixo:
{lista_titulares}
   - **Categoria Flexível — Desembargadores Convocados, Substitutos ou Ministros Visitantes** (`role`: `"convocado_substituto"`, `category_label`: `"Desembargadores Convocados / Substitutos"`): qualquer desembargador convocado, juiz federal convocado, ministro substituto ou magistrado não integrante do rol de titulares acima deve receber `role`: `"convocado_substituto"`, com o nome higienizado e padronizado (ex.: `"Des. Conv. Manoel Erhardt"` ou `"Min. [Nome] (Substituto/Convocado)"`).
   - Se o relator for `"Não identificado"` ou inaudível, devolva `relatores: []`.
   - Defina `"is_herman": true` exclusivamente quando o julgador for `"Min. Herman Benjamin"`.

3. `has_herman` (booleano): `true` se o Min. Herman Benjamin for o relator, tiver proferido voto-vista, voto vogal, divergência ou intervenção registrada no julgado.

4. `is_relevant` (booleano): `true` se for caso de destaque (*leading case*, recurso repetitivo, IAC, mudança de jurisprudência, divergência qualificada ou debate institucional de grande impacto).

Devolva EXCLUSIVAMENTE um JSON válido (sem blocos markdown extras se possível) no formato:
{{
  "classifications": [
    {{
      "index": 1,
      "materia_id": 12,
      "relatores": [
        {{
          "name": "Min. Herman Benjamin",
          "role": "titular",
          "category_label": "Ministros Titulares",
          "is_herman": true
        }}
      ],
      "has_herman": true,
      "is_relevant": true
    }}
  ]
}}

JULGADOS PARA CLASSIFICAR:
{julgados_json}
"""


def _extrair_json_resposta(texto: str) -> dict[str, Any] | None:
    """Extrai o objeto JSON da resposta do modelo Flash."""
    if not texto:
        return None
    limpo = texto.strip()
    limpo = re.sub(r"^```(?:json)?\s*\n", "", limpo, flags=re.IGNORECASE)
    limpo = re.sub(r"\n```\s*$", "", limpo)
    try:
        return json.loads(limpo)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", limpo)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None


def classificar_processos_via_subagente_flash(
    processos_brutos: list[dict[str, Any]],
    gemini_client: GeminiClient | None = None,
) -> dict[int, dict[str, Any]]:
    """
    Delega ao modelo Gemini Flash (tier='flash') a classificação semântica em lote
    das 15 matérias do Gabinete e dos julgadores (Titulares vs Convocados/Substitutos).
    Retorna um dicionário mapeando `index -> dados_classificados`.
    """
    if not processos_brutos:
        return {}

    if gemini_client is None:
        from stj_sessoes.gemini_client import GeminiClient

        gemini_client = GeminiClient()

    if not gemini_client.disponivel:
        logger.warning("Gemini Flash indisponível para classificação de lote.")
        return {}

    payload_entrada = [
        {
            "index": p.get("index"),
            "heading": p.get("heading"),
            "raw_materia": p.get("raw_materia", ""),
            "raw_relator": p.get("raw_relator", ""),
            "raw_relevancia": p.get("raw_relevancia", ""),
            "herman_manifestation": p.get("hermanManifestation", ""),
            "tese": p.get("tese", ""),
            "resumo": (p.get("resumoDiscussao") or "")[:600],
        }
        for p in processos_brutos
    ]

    prompt = PROMPT_SUBAGENTE_CLASSIFICADOR_FLASH.format(
        lista_materias=listar_materias_para_prompt(),
        lista_titulares=listar_ministros_titulares_para_prompt(),
        julgados_json=json.dumps(payload_entrada, ensure_ascii=False, indent=2),
    )

    ok, resposta, erro = gemini_client.gerar_conteudo(prompt, tier="flash")
    if not ok or not resposta:
        logger.warning("Falha na classificação via subagente Flash: %s", erro)
        return {}

    dados = _extrair_json_resposta(resposta)
    if not dados or not isinstance(dados.get("classifications"), list):
        logger.warning("Resposta do subagente Flash fora do schema JSON esperado.")
        return {}

    mapa_resultado: dict[int, dict[str, Any]] = {}
    for item in dados["classifications"]:
        if not isinstance(item, dict) or "index" not in item:
            continue
        try:
            idx = int(item["index"])
        except (TypeError, ValueError):
            continue

        materia_obj = obter_materia_por_id(item.get("materia_id"))
        relatores_validados: list[dict[str, Any]] = []
        for rel in item.get("relatores") or []:
            if not isinstance(rel, dict) or not rel.get("name"):
                continue
            nome_rel = str(rel["name"]).strip()
            role = (
                "convocado_substituto"
                if rel.get("role") == "convocado_substituto"
                else "titular"
            )
            cat_label = (
                "Desembargadores Convocados / Substitutos"
                if role == "convocado_substituto"
                else "Ministros Titulares"
            )
            is_h = bool(rel.get("is_herman")) or eh_herman_benjamin(nome_rel)
            relatores_validados.append(
                {
                    "name": nome_rel,
                    "role": role,
                    "category_label": cat_label,
                    "is_herman": is_h,
                }
            )

        mapa_resultado[idx] = {
            "materia": materia_obj,
            "relatores": relatores_validados,
            "has_herman": bool(item.get("has_herman")) or any(r["is_herman"] for r in relatores_validados),
            "is_relevant": bool(item.get("is_relevant")),
        }

    return mapa_resultado
