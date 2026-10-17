"""Sumarização jurídica de sessões da Primeira Turma e Primeira Seção do STJ (GMHB)."""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from stj_sessoes.config import (
    DEFAULT_MAX_CHUNK_THREADS,
    LIMITE_CARACTERES_RESUMO_CHUNK,
)
from stj_sessoes.gemini_client import GeminiClient
from stj_sessoes.taxonomy import listar_materias_para_prompt, nome_orgao_canonico
from stj_sessoes.transcript_sanitizer import formatar_data_br
from stj_sessoes.youtube_client import VideoInfo

logger = logging.getLogger(__name__)

SECOES_OBRIGATORIAS = (
    "Atuação e Manifestações do Min. Herman Benjamin",
    "Destaques da Sessão",
    "Processos Julgados",
    "Estatísticas",
)

PROMPT_RESUMO_SESSAO = """Você é um assessor jurídico sênior no Gabinete do Ministro Herman Benjamin no Superior Tribunal de Justiça (STJ), atuando na Primeira Turma e na Primeira Seção (Direito Público).

Analise a transcrição da sessão de julgamento abaixo e elabore um resumo técnico, rigoroso e estruturado em Markdown, observando EXATAMENTE as seções e os campos indicados a seguir:

## Atuação e Manifestações do Min. Herman Benjamin
- Liste TODAS as intervenções, votos (como relator, voto-vista, vogal ou divergência), apartes, esclarecimentos fáticos ou conceituais, questões de ordem e conduções relevantes do **Min. Herman Benjamin** durante a sessão.
- Formato de cada item: `- **[Classe e Número do Recurso ou Tema debatido] (Início: [HH:MM:SS]):** [Síntese técnica e fiel da manifestação, destacando os fundamentos jurídicos, precedentes ou distinções suscitadas pelo Ministro].`
- Caso o Ministro não tenha proferido manifestação individualizada no segmento analisado, registre: `- Sem manifestações individualizadas registradas neste segmento da transmissão.`

## Destaques da Sessão
- Destaque os casos de maior relevância jurídica, institucional ou repercussão social julgados na sessão (recursos repetitivos, mudanças de jurisprudência, teses inéditas, divergências qualificadas, pedidos de vista em temas sensíveis).
- Formato: `- **[Processo / Tema]:** [Síntese executiva do ponto de destaque e da controvérsia].`

## Processos Julgados

Para CADA processo apregoado, debatido ou julgado na sessão, crie uma subseção no formato exato abaixo:

### N. [Classe e Número do Recurso]/[UF] - [Tema principal sintético] (Início: [HH:MM:SS])
- **Matéria:** [Escolha OBRIGATORIAMENTE uma das 15 matérias oficiais do Gabinete listadas abaixo, copiando o código exato "N. Nome da Matéria"]
- **Relator:** [Min. Nome Canônico | ou Des. Conv. Nome (Desembargador Convocado / Substituto)]
- **Resultado:** [Provido / Desprovido / Parcialmente provido / Não conhecido / Pedido de vista / Adiado / Retirado de pauta]
- **Votação:** [Unânime / Maioria (especificando vencidos e relator para acórdão) / Aguardando conclusão]
- **Relevância:** [Alta — Caso de Destaque | Ordinária]
- **Manifestação do Min. Herman Benjamin:** [Descreva com precisão o voto, voto-vista, aparte ou ponderação feita pelo Min. Herman Benjamin neste processo. Se ele apenas acompanhou em votação simbólica sem fala individualizada, omita esta linha]
- **Tese fixada:** [Enuncie de forma clara e técnica a tese jurídica decidida. Se o julgamento foi suspenso por pedido de vista ou a tese é apenas do voto ainda não concluído, inicie OBRIGATORIAMENTE com o prefixo `[PROPOSTA]`. Se houver tese relevante de voto divergente derrotado, registre-a com o prefixo `[VOTO VENCIDO]`.]
- **Resumo da discussão:** [Parágrafo analítico e completo descrevendo o objeto recursal, os argumentos das sustentações orais (se houver), os fundamentos do relator, as intervenções dos Ministros e a conclusão do colegiado.]

## Estatísticas
- Total de processos apreciados: X
- Providos: X | Desprovidos: X | Parcialmente providos: X | Pedidos de vista / Adiados / Outros: X
- Processos com atuação destacada do Min. Herman Benjamin: X

LISTA OFICIAL DAS 15 MATÉRIAS DO GABINETE (use exatamente uma destas opções no campo `- **Matéria:**`):
{lista_materias}

REGRAS ESTRITAS DE REDAÇÃO:
- Devolva APENAS o Markdown final, começando diretamente em `## Atuação e Manifestações do Min. Herman Benjamin`.
- NUNCA utilize emojis ou símbolos informais.
- Empregue terminologia processual rigorosa (não confunda "não conhecer", "negar provimento", "rejeitar" e "julgar improcedente").
- Preserve rigorosamente a minutagem `(Início: [HH:MM:SS])` no fim de cada título `### N. ...` com base nos timestamps da transcrição.
- Quando um julgador atuar como Desembargador Convocado ou Ministro Substituto/convocado de outro órgão, identifique-o claramente no campo `- **Relator:**` com o prefixo `Des. Conv.` ou o sufixo `(Substituto/Convocado)`.
- Mantenha absoluta fidelidade ao que foi dito na sessão; se o número do processo não for audível com segurança, utilize `[Processo não identificado]`.

ÓRGÃO E DATA DA SESSÃO: {orgao} — {data}

TRANSCRIÇÃO DA SESSÃO:

{transcricao}
"""

PROMPT_CONSOLIDACAO_RESUMO = """Você recebeu resumos parciais de segmentos de uma mesma sessão de julgamento da {orgao} do STJ realizada em {data}.

Consolide todos os segmentos em um ÚNICO resumo final coeso e completo, observando rigorosamente a estrutura e as regras abaixo:
1. Mantenha exatamente estas quatro seções de nível 2, nesta ordem:
   - `## Atuação e Manifestações do Min. Herman Benjamin`
   - `## Destaques da Sessão`
   - `## Processos Julgados`
   - `## Estatísticas`
2. Na seção `## Atuação e Manifestações do Min. Herman Benjamin`, reúna todas as intervenções do Ministro ocorridas ao longo de toda a sessão, sem duplicidades, mantendo a minutagem `(Início: [HH:MM:SS])`.
3. Na seção `## Processos Julgados`, unifique processos que tenham começado em um segmento e terminado no seguinte, renumere sequencialmente (`### 1. ...`, `### 2. ...`) e preserve TODOS os campos:
   - `- **Matéria:**` (usando exclusivamente uma das 15 matérias numeradas do Gabinete)
   - `- **Relator:**`
   - `- **Resultado:**`
   - `- **Votação:**`
   - `- **Relevância:**`
   - `- **Manifestação do Min. Herman Benjamin:**` (quando houver)
   - `- **Tese fixada:**`
   - `- **Resumo da discussão:**`
4. Preserve rigorosamente os timestamps `(Início: [HH:MM:SS])` nos títulos `### N. ...`.
5. Some e consolide corretamente os números na seção `## Estatísticas`.
6. NUNCA utilize emojis nem adicione textos introdutórios antes da primeira seção.

LISTA OFICIAL DAS 15 MATÉRIAS DO GABINETE:
{lista_materias}

RESUMOS PARCIAIS DOS SEGMENTOS:

{resumos_parciais}
"""


@dataclass
class ResumoArtefatos:
    bruto: str
    canonico: str
    meta: dict[str, Any]


def normalizar_markdown_resumo(texto: str) -> str:
    """Padroniza cabeçalhos, remove introduções conversacionais e garante consistência estrutural."""
    limpo = (texto or "").replace("\r\n", "\n").replace("\r", "\n").replace("\ufeff", "").strip()
    if not limpo:
        return ""

    # Remover cercas de código markdown se o modelo tiver envolvido a resposta
    limpo = re.sub(r"^```(?:markdown|md)?\s*\n", "", limpo, flags=re.IGNORECASE)
    limpo = re.sub(r"\n```\s*$", "", limpo)

    # Cortar qualquer texto antes da primeira seção ##
    match_primeira_secao = re.search(r"(?m)^##\s+", limpo)
    if match_primeira_secao:
        limpo = limpo[match_primeira_secao.start() :]

    substituicoes = {
        "## Processos Julgados e Apregoados": "## Processos Julgados",
        "## Destaques Institucionais": "## Destaques da Sessão",
        "## Estatísticas Finais": "## Estatísticas",
        "- **Tese Fixada:**": "- **Tese fixada:**",
        "- **Resumo:**": "- **Resumo da discussão:**",
        "- **Materia:**": "- **Matéria:**",
        "- **Relevancia:**": "- **Relevância:**",
    }
    for antigo, novo in substituicoes.items():
        limpo = limpo.replace(antigo, novo)

    limpo = re.sub(r"\n{3,}", "\n\n", limpo)
    return limpo.strip()


def analisar_qualidade_resumo(video: VideoInfo, bruto: str, canonico: str) -> dict[str, Any]:
    """Valida a presença das seções obrigatórias, contagem de processos, matérias e timestamps."""
    secoes = [m.group(1).strip() for m in re.finditer(r"(?m)^##\s+(.+)$", canonico)]
    processos = [m.group(1).strip() for m in re.finditer(r"(?m)^###\s+(.+)$", canonico)]
    com_timestamp = sum(
        1
        for p in processos
        if re.search(r"\(In[ií]cio:\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\)", p, re.IGNORECASE)
    )
    materias = re.findall(r"(?im)^-\s*\*\*Mat[eé]ria:\*\*\s*(.+)$", canonico)
    manifestacoes_herman = re.findall(
        r"(?im)^-\s*\*\*Manifesta[cç][aã]o\s+do\s+Min\.\s+Herman\s+Benjamin:\*\*\s*(.+)$",
        canonico,
    )

    faltantes = [s for s in SECOES_OBRIGATORIAS if s not in secoes]

    return {
        "video_id": video.video_id,
        "upload_date": video.upload_date,
        "orgao": video.orgao,
        "validated_at": datetime.now().isoformat(),
        "required_sections_ok": len(faltantes) == 0,
        "missing_sections": faltantes,
        "sections": secoes,
        "process_count": len(processos),
        "materia_count": len(materias),
        "herman_process_manifestations": len(manifestacoes_herman),
        "timestamp_coverage": {
            "with_timestamp": com_timestamp,
            "without_timestamp": max(len(processos) - com_timestamp, 0),
        },
    }


def envolver_markdown_resumo(video: VideoInfo, resumo_canonico: str) -> str:
    """Adiciona o cabeçalho documental do resumo da sessão."""
    orgao_nome = nome_orgao_canonico(video.orgao)
    data_br = formatar_data_br(video.upload_date)
    return (
        f"# Resumo — {orgao_nome} — {data_br}\n\n"
        f"**Vídeo:** [{video.title}]({video.url})\n"
        f"**Data:** {data_br}\n"
        f"**Órgão:** {orgao_nome}\n\n"
        f"---\n\n"
        f"{resumo_canonico.strip()}\n"
    )


def _dividir_transcricao_para_resumo(transcricao: str, limite_chars: int) -> list[str]:
    linhas = transcricao.splitlines()
    chunks: list[str] = []
    atual: list[str] = []
    chars = 0
    tamanho_alvo = max(15000, limite_chars // 2)

    for linha in linhas:
        atual.append(linha)
        chars += len(linha) + 1
        if chars >= tamanho_alvo:
            chunks.append("\n".join(atual))
            atual = []
            chars = 0

    if atual:
        chunks.append("\n".join(atual))
    return chunks


def gerar_resumo_sessao(
    video: VideoInfo,
    transcricao: str,
    gemini_client: GeminiClient,
    max_threads: int = DEFAULT_MAX_CHUNK_THREADS,
) -> tuple[bool, ResumoArtefatos | None, str | None]:
    """
    Gera o resumo estruturado da sessão via Gemini Pro, com destaque às manifestações
    do Min. Herman Benjamin e classificação nas 15 matérias do Gabinete.
    """
    if not gemini_client.disponivel:
        return False, None, "Cliente Gemini indisponível."

    orgao_nome = nome_orgao_canonico(video.orgao)
    data_br = formatar_data_br(video.upload_date)
    lista_materias = listar_materias_para_prompt()

    if len(transcricao) <= LIMITE_CARACTERES_RESUMO_CHUNK:
        prompt = PROMPT_RESUMO_SESSAO.format(
            orgao=orgao_nome,
            data=data_br,
            lista_materias=lista_materias,
            transcricao=transcricao,
        )
        ok, bruto, erro = gemini_client.gerar_conteudo(prompt, tier="pro")
        if not ok:
            return False, None, erro
        canonico = normalizar_markdown_resumo(bruto)
        meta = analisar_qualidade_resumo(video, bruto, canonico)
        return True, ResumoArtefatos(bruto=bruto, canonico=canonico, meta=meta), None

    chunks = _dividir_transcricao_para_resumo(transcricao, LIMITE_CARACTERES_RESUMO_CHUNK)
    logger.info(
        "Transcrição longa (%d chars) dividida em %d segmentos para sumarização.",
        len(transcricao),
        len(chunks),
    )

    def resumir_segmento(item: tuple[int, str]) -> tuple[int, str | None]:
        idx, chunk = item
        prompt_seg = PROMPT_RESUMO_SESSAO.format(
            orgao=f"{orgao_nome} (Segmento {idx}/{len(chunks)})",
            data=data_br,
            lista_materias=lista_materias,
            transcricao=chunk,
        )
        ok, resultado, erro = gemini_client.gerar_conteudo(prompt_seg, tier="pro")
        if not ok:
            logger.warning("Falha ao resumir segmento %d/%d: %s", idx, len(chunks), erro)
            return idx, None
        return idx, normalizar_markdown_resumo(resultado)

    workers = max(1, min(max_threads, len(chunks)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        pares = list(executor.map(resumir_segmento, enumerate(chunks, 1)))

    pares.sort(key=lambda x: x[0])
    parciais = [
        f"<!-- Segmento {idx}/{len(chunks)} -->\n{texto}"
        for idx, texto in pares
        if texto
    ]

    if not parciais:
        return False, None, "Nenhum segmento pôde ser resumido."

    if len(parciais) == 1:
        bruto_final = parciais[0]
    else:
        prompt_cons = PROMPT_CONSOLIDACAO_RESUMO.format(
            orgao=orgao_nome,
            data=data_br,
            lista_materias=lista_materias,
            resumos_parciais="\n\n---\n\n".join(parciais),
        )
        ok, consolidado, erro = gemini_client.gerar_conteudo(prompt_cons, tier="pro")
        if ok and consolidado:
            bruto_final = consolidado
        else:
            logger.warning("Fallback na consolidação (%s): unindo segmentos.", erro)
            bruto_final = "\n\n".join(parciais)

    canonico_final = normalizar_markdown_resumo(bruto_final)
    meta = analisar_qualidade_resumo(video, bruto_final, canonico_final)
    return True, ResumoArtefatos(bruto=bruto_final, canonico=canonico_final, meta=meta), None
