"""Gera o material de contexto do Assistente (web/assistente/) a partir das sessões publicáveis.

O proxy do assistente (worker/) não interpreta o data.js: ele lê dois tipos de arquivo
publicados junto com o portal.

- ``assistente/indice.json``: lista leve das sessões, com um resumo textual pronto por sessão
  (processos, resultados, teses, pauta). Serve para perguntas sobre várias sessões e para
  escolher quais sessões carregar por inteiro.
- ``assistente/sessoes/<id>.txt``: material completo de uma sessão (resumo estruturado,
  pauta oficial e transcrição revisada), já formatado para ir direto ao modelo.

Os textos saem prontos para que o proxy só precise concatená-los, gastando pouca CPU.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

VERSAO_CORPUS = 1
LIMITE_TESE_INDICE = 600
LIMITE_MANIFESTACAO_INDICE = 400
_ID_VALIDO = re.compile(r"^\d{4}-\d{2}-\d{2}_[a-z_]+$")


def _texto(valor: Any) -> str:
    return re.sub(r"\s+", " ", str(valor or "")).strip()


def _truncar(texto: str, limite: int) -> str:
    texto = _texto(texto)
    if len(texto) <= limite:
        return texto
    return texto[: limite - 1].rstrip() + "…"


def _video_principal(sessao: dict[str, Any]) -> str:
    urls = sessao.get("videoUrls") or []
    return urls[0] if urls else ""


def _linha_processo(proc: dict[str, Any]) -> str:
    partes = [f"- {_texto(proc.get('processNumber')) or _texto(proc.get('heading'))}"]
    if proc.get("timestamp"):
        partes[0] += f" [{proc['timestamp']}]"
    tema = _texto(proc.get("theme"))
    if tema:
        partes.append(f"Tema: {tema}")
    materia = (proc.get("materia") or {}).get("short")
    if materia:
        partes.append(f"Matéria: {materia}")
    if proc.get("relator"):
        partes.append(f"Relator: {_texto(proc['relator'])}")
    if proc.get("resultado"):
        partes.append(f"Resultado: {_texto(proc['resultado'])}")
    if proc.get("resultadoOficial"):
        partes.append(f"Resultado oficial (pauta): {_texto(proc['resultadoOficial'])}")
    if proc.get("votacao"):
        partes.append(f"Votação: {_texto(proc['votacao'])}")
    if proc.get("temaRepetitivo"):
        partes.append(f"Tema repetitivo: {_texto(proc['temaRepetitivo'])}")
    if proc.get("hasHerman"):
        papel = "relator" if proc.get("isHermanRelator") else "manifestou-se"
        manif = _truncar(proc.get("hermanManifestation") or "", LIMITE_MANIFESTACAO_INDICE)
        partes.append(f"Min. Herman Benjamin ({papel})" + (f": {manif}" if manif else ""))
    if proc.get("tese"):
        tipo = _texto(proc.get("teseType")) or "tese"
        partes.append(f"Tese ({tipo}): {_truncar(proc['tese'], LIMITE_TESE_INDICE)}")
    return " — ".join(partes)


def _linha_pauta(item: dict[str, Any], detalhada: bool) -> str:
    cab = f"- Item {item.get('item', '?')}: {_texto(item.get('processo'))}"
    partes = [cab]
    if item.get("relator"):
        partes.append(f"Relator: {_texto(item['relator'])}")
    if item.get("vistor"):
        partes.append(f"Vista: {_texto(item['vistor'])}")
    if item.get("categoria"):
        partes.append(f"Categoria: {_texto(item['categoria'])}")
    if item.get("assunto"):
        partes.append(f"Assunto: {_texto(item['assunto'])}")
    if item.get("tema_repetitivo"):
        partes.append(f"Tema repetitivo: {_texto(item['tema_repetitivo'])}")
    if item.get("resultado_oficial"):
        partes.append(f"Resultado oficial: {_texto(item['resultado_oficial'])}")
    if item.get("timestamp"):
        partes.append(f"Minuto no vídeo: {item['timestamp']}")
    if detalhada:
        if item.get("segredo_justica"):
            partes.append("Segredo de justiça")
        else:
            nomes = [
                f"{_texto(p.get('papel'))}: {_texto(p.get('nome'))}"
                for p in (item.get("partes") or [])
                if p.get("nome")
            ]
            if nomes:
                partes.append("Partes: " + "; ".join(nomes))
            sust = [
                f"{_texto(s.get('advogado'))} (por {_texto(s.get('partes'))})"
                for s in (item.get("sustentacoes_orais") or [])
                if s.get("advogado")
            ]
            if sust:
                partes.append("Sustentação oral: " + "; ".join(sust))
    return " — ".join(partes)


def _cabecalho(sessao: dict[str, Any]) -> list[str]:
    linhas = [
        f"Sessão: {sessao.get('title', '')}",
        f"Órgão: {sessao.get('orgao', '')} — Data: {sessao.get('date', '')}",
    ]
    video = _video_principal(sessao)
    if video:
        linhas.append(f"Vídeo: {video}")
    stats = sessao.get("stats") or {}
    if stats:
        linhas.append(
            "Totais: {total} processos discutidos; {pauta} itens na pauta; {prov} providos; "
            "{desp} desprovidos; {parc} parciais; {vista} vistas/adiados; "
            "{herman} com participação do Min. Herman Benjamin; {teses} teses.".format(
                total=stats.get("total", 0),
                pauta=stats.get("pautaTotal", 0),
                prov=stats.get("providos", 0),
                desp=stats.get("desprovidos", 0),
                parc=stats.get("parciais", 0),
                vista=stats.get("vistasAdiados", 0),
                herman=stats.get("hermanCount", 0),
                teses=stats.get("thesesCount", 0),
            )
        )
    return linhas


def montar_texto_indice(sessao: dict[str, Any]) -> str:
    """Resumo compacto de uma sessão para perguntas que abrangem várias sessões."""
    linhas = [f'<sessao_indice id="{sessao["id"]}">', *_cabecalho(sessao)]
    processos = sessao.get("processes") or []
    if processos:
        linhas.append("Processos discutidos na sessão:")
        linhas.extend(_linha_processo(p) for p in processos)
    itens = ((sessao.get("pauta") or {}).get("itens")) or []
    if itens:
        linhas.append("Pauta oficial (resumida):")
        linhas.extend(_linha_pauta(i, detalhada=False) for i in itens)
    linhas.append("</sessao_indice>")
    return "\n".join(linhas)


def montar_texto_sessao(sessao: dict[str, Any]) -> str:
    """Material completo de uma sessão: resumo estruturado, pauta e transcrição revisada."""
    linhas = [f'<sessao id="{sessao["id"]}">', *_cabecalho(sessao), ""]
    resumo = (sessao.get("content") or "").strip()
    if resumo:
        linhas += ["<resumo_estruturado>", resumo, "</resumo_estruturado>", ""]
    itens = ((sessao.get("pauta") or {}).get("itens")) or []
    if itens:
        linhas.append("<pauta_oficial>")
        linhas.extend(_linha_pauta(i, detalhada=True) for i in itens)
        linhas += ["</pauta_oficial>", ""]
    transcricao = (sessao.get("transcriptMarkdown") or "").strip()
    if transcricao:
        linhas += [
            "<transcricao_revisada>",
            transcricao,
            "</transcricao_revisada>",
        ]
    linhas.append("</sessao>")
    return "\n".join(linhas)


def gerar_corpus_assistente(sessoes: list[dict[str, Any]], destino_dir: Path) -> dict[str, Any]:
    """Grava indice.json e sessoes/<id>.txt em ``destino_dir`` e devolve o índice gerado."""
    sessoes_dir = destino_dir / "sessoes"
    sessoes_dir.mkdir(parents=True, exist_ok=True)

    entradas: list[dict[str, Any]] = []
    arquivos_gerados: set[str] = set()
    for sessao in sessoes:
        sessao_id = str(sessao.get("id") or "")
        if not _ID_VALIDO.match(sessao_id):
            logger.warning("Sessão com id inesperado ignorada no corpus do assistente: %r", sessao_id)
            continue

        texto = montar_texto_sessao(sessao)
        nome_arquivo = f"{sessao_id}.txt"
        (sessoes_dir / nome_arquivo).write_text(texto, encoding="utf-8")
        arquivos_gerados.add(nome_arquivo)

        materia_ids = sorted(
            {
                int((p.get("materia") or {}).get("id"))
                for p in (sessao.get("processes") or [])
                if (p.get("materia") or {}).get("id")
            }
        )
        entradas.append(
            {
                "id": sessao_id,
                "titulo": sessao.get("title", ""),
                "orgao": sessao.get("orgao", ""),
                "orgaoSlug": sessao.get("orgaoSlug", ""),
                "data": sessao.get("date", ""),
                "isoDate": sessao.get("isoDate", ""),
                "videoUrl": _video_principal(sessao),
                "materiaIds": materia_ids,
                "arquivo": f"assistente/sessoes/{nome_arquivo}",
                "caracteres": len(texto),
                "indice": montar_texto_indice(sessao),
            }
        )

    # Remove arquivos de sessões que deixaram de ser publicadas
    for antigo in sessoes_dir.glob("*.txt"):
        if antigo.name not in arquivos_gerados:
            antigo.unlink()

    # Sem data de geração: o arquivo só muda quando as sessões mudam
    indice = {
        "versao": VERSAO_CORPUS,
        "sessoes": entradas,
    }
    (destino_dir / "indice.json").write_text(
        json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    logger.info("Corpus do assistente gerado com %d sessão(ões) em %s.", len(entradas), destino_dir)
    return indice
