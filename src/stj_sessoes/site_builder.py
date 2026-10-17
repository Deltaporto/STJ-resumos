"""Compilador de dados estáticos (web/data.js e web/transcricoes/) para o portal público."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from stj_sessoes.config import OUTPUT_DIR, WEB_DIR, WEB_TRANSCRICOES_DIR
from stj_sessoes.taxonomy import (
    MATERIAS_GABINETE,
    ORGAOS_PUBLICAVEIS,
    classificar_processos_via_subagente_flash,
    eh_herman_benjamin,
    nome_orgao_canonico,
    normalizar_chave,
    obter_materia_por_id,
)
from stj_sessoes.transcript_sanitizer import formatar_data_br

logger = logging.getLogger(__name__)

TIMESTAMP_HEADING_RE = re.compile(r"\(In[ií]cio:\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\)", re.IGNORECASE)
CAMPO_BOLD_RE = re.compile(r"^\s*-\s*\*\*(.+?):\*\*\s*(.*)$")


def limpar_markdown_inline(texto: str) -> str:
    """Remove marcações inline básicas de Markdown preservando o texto."""
    if not texto:
        return ""
    limpo = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", str(texto))
    return re.sub(r"[*_`~]", "", limpo).strip()


def timestamp_para_segundos(ts: str) -> int:
    if not ts:
        return 0
    partes = [int(p) for p in ts.strip().split(":") if p.isdigit()]
    if len(partes) == 3:
        return partes[0] * 3600 + partes[1] * 60 + partes[2]
    if len(partes) == 2:
        return partes[0] * 60 + partes[1]
    return 0


def construir_url_com_tempo(video_url: str, segundos: int) -> str:
    if not video_url or segundos <= 0:
        return video_url or ""
    separador = "&" if "?" in video_url else "?"
    return f"{video_url}{separador}t={segundos}s"


def classificar_categoria_resultado(resultado: str) -> tuple[str, str]:
    """Retorna (slug_categoria, rotulo_curto) para o badge de resultado."""
    norm = normalizar_chave(resultado)
    if not norm:
        return "outros", "Julgado"
    if "vista" in norm:
        return "vista", "Pedido de Vista"
    if "adiad" in norm or "retirad" in norm or "suspens" in norm:
        return "adiado", "Adiado / Suspenso"
    if "parcial" in norm:
        return "parcial", "Parcialmente Provido"
    if "nao conhecid" in norm or "nao se conhec" in norm:
        return "nao_conhecido", "Não Conhecido"
    if "desprovid" in norm or "negado provimento" in norm or "negar provimento" in norm or "improvid" in norm or "rejeitad" in norm:
        return "desprovido", "Desprovido"
    if "provid" in norm or "dar provimento" in norm or "acolhid" in norm:
        return "provido", "Provido"
    return "outros", limpar_markdown_inline(resultado)[:28]


def extrair_secoes_nivel2(markdown: str) -> dict[str, str]:
    """Divide o Markdown em um dicionário {chave_normalizada: conteudo_da_secao}."""
    linhas = (markdown or "").replace("\r\n", "\n").replace("\r", "\n").splitlines()
    secoes: dict[str, list[str]] = {}
    chave_atual: str | None = None

    for linha in linhas:
        match = re.match(r"^##\s+(.+)$", linha.strip())
        if match:
            titulo = limpar_markdown_inline(match.group(1))
            chave_atual = normalizar_chave(titulo)
            secoes.setdefault(chave_atual, [])
            continue
        if chave_atual is not None:
            secoes[chave_atual].append(linha)

    return {k: "\n".join(v).strip() for k, v in secoes.items()}


def extrair_itens_lista_secao(texto_secao: str, video_url: str = "") -> list[dict[str, Any]]:
    """Extrai itens em lista (- **Título:** Texto) de seções como Destaques ou Atuação do Min. Herman."""
    itens: list[dict[str, Any]] = []
    if not texto_secao:
        return itens

    for linha in texto_secao.splitlines():
        limpa = linha.strip()
        if not limpa.startswith("- "):
            continue
        corpo = limpa[2:].strip()
        if "sem manifestacoes individualizadas" in normalizar_chave(corpo):
            continue

        ts_match = TIMESTAMP_HEADING_RE.search(corpo)
        timestamp = ts_match.group(1) if ts_match else ""
        segundos = timestamp_para_segundos(timestamp)
        corpo_sem_ts = TIMESTAMP_HEADING_RE.sub("", corpo).strip()

        match_bold = re.match(r"^\*\*(.+?)\*\*\s*:?\s*(.*)$", corpo_sem_ts)
        if match_bold:
            titulo = limpar_markdown_inline(match_bold.group(1).rstrip(":"))
            descricao = limpar_markdown_inline(match_bold.group(2))
        else:
            titulo = ""
            descricao = limpar_markdown_inline(corpo_sem_ts)

        itens.append(
            {
                "title": titulo,
                "text": descricao,
                "timestamp": timestamp,
                "seconds": segundos,
                "videoUrl": construir_url_com_tempo(video_url, segundos) if video_url else "",
            }
        )
    return itens


def _separar_numero_e_tema(titulo_sem_indice: str) -> tuple[str, str]:
    """Separa 'REsp 1.234.567/SP - Improbidade administrativa' em (numero, tema)."""
    partes = re.split(r"\s+[—–-]\s+", titulo_sem_indice, maxsplit=1)
    if len(partes) == 2:
        return partes[0].strip(), partes[1].strip()
    return titulo_sem_indice.strip(), ""


def extrair_processos_estruturados(
    markdown: str,
    video_url: str,
    part_label: str = "",
    start_index: int = 1,
    classificacao_cache_path: Path | None = None,
    usar_subagente_flash: bool = True,
) -> list[dict[str, Any]]:
    """
    Analisa a seção '## Processos Julgados' e utiliza a classificação gerada pelo
    Subagente Gemini Flash (carregada de arquivo de cache JSON ou invocada sob demanda).
    """
    secoes = extrair_secoes_nivel2(markdown)
    bloco_processos = ""
    for chave, valor in secoes.items():
        if "processos julgados" in chave:
            bloco_processos = valor
            break
    if not bloco_processos:
        bloco_processos = markdown

    linhas = bloco_processos.splitlines()
    blocos_h3: list[tuple[str, list[str]]] = []
    titulo_atual: str | None = None
    linhas_atuais: list[str] = []

    for linha in linhas:
        match_h3 = re.match(r"^###\s+(.+)$", linha.strip())
        if match_h3:
            if titulo_atual is not None:
                blocos_h3.append((titulo_atual, linhas_atuais))
            titulo_atual = match_h3.group(1).strip()
            linhas_atuais = []
        elif titulo_atual is not None:
            if re.match(r"^##\s+", linha.strip()):
                break
            linhas_atuais.append(linha)

    if titulo_atual is not None:
        blocos_h3.append((titulo_atual, linhas_atuais))

    processos: list[dict[str, Any]] = []
    for offset, (raw_heading, body_lines) in enumerate(blocos_h3):
        idx = start_index + offset
        ts_match = TIMESTAMP_HEADING_RE.search(raw_heading)
        timestamp = ts_match.group(1) if ts_match else ""
        segundos = timestamp_para_segundos(timestamp)

        heading_sem_ts = TIMESTAMP_HEADING_RE.sub("", raw_heading).strip()
        heading_sem_num = re.sub(r"^\d+\.\s*", "", heading_sem_ts).strip()
        heading_limpo = limpar_markdown_inline(heading_sem_num)
        process_number, theme = _separar_numero_e_tema(heading_limpo)

        campos: dict[str, str] = {}
        ultimo_campo: str | None = None

        for linha in body_lines:
            match_campo = CAMPO_BOLD_RE.match(linha)
            if match_campo:
                chave_c = normalizar_chave(match_campo.group(1))
                valor_c = match_campo.group(2).strip()
                campos[chave_c] = valor_c
                ultimo_campo = chave_c
            elif ultimo_campo and linha.strip():
                sub = re.sub(r"^\s*[-*]\s*", "", linha.strip())
                campos[ultimo_campo] = f"{campos[ultimo_campo]} {sub}".strip()

        raw_materia = limpar_markdown_inline(campos.get("materia", ""))
        raw_relator = limpar_markdown_inline(campos.get("relator", "Não identificado"))
        raw_resultado = limpar_markdown_inline(campos.get("resultado", "Julgado"))
        raw_votacao = limpar_markdown_inline(campos.get("votacao", ""))
        raw_relevancia = limpar_markdown_inline(campos.get("relevancia", ""))
        raw_herman = limpar_markdown_inline(
            campos.get("manifestacao do min. herman benjamin")
            or campos.get("manifestacao do ministro herman benjamin")
            or campos.get("atuacao do min. herman benjamin")
            or ""
        )
        raw_tese = limpar_markdown_inline(campos.get("tese fixada", ""))
        raw_resumo = limpar_markdown_inline(
            campos.get("resumo da discussao") or campos.get("resumo", "")
        )

        tese_type = ""
        tese_limpa = raw_tese
        if raw_tese:
            upper_tese = raw_tese.upper()
            if "[PROPOSTA]" in upper_tese or "PENDENTE" in upper_tese:
                tese_type = "proposta"
                tese_limpa = re.sub(r"^\[PROPOSTA\]\s*:?\s*", "", raw_tese, flags=re.IGNORECASE).strip()
            elif "[VOTO VENCIDO]" in upper_tese:
                tese_type = "vencido"
                tese_limpa = re.sub(r"^\[VOTO VENCIDO\]\s*:?\s*", "", raw_tese, flags=re.IGNORECASE).strip()
            else:
                tese_type = "final"

        res_cat, res_label = classificar_categoria_resultado(raw_resultado)

        processos.append(
            {
                "index": idx,
                "localIndex": offset + 1,
                "heading": heading_limpo,
                "processNumber": process_number,
                "theme": theme,
                "timestamp": timestamp,
                "seconds": segundos,
                "videoUrl": construir_url_com_tempo(video_url, segundos) if video_url else "",
                "baseVideoUrl": video_url,
                "partLabel": part_label,
                "raw_materia": raw_materia,
                "raw_relator": raw_relator,
                "raw_relevancia": raw_relevancia,
                "materia": obter_materia_por_id(raw_materia),
                "relator": raw_relator or "Não identificado",
                "relatores": [],
                "resultado": raw_resultado,
                "resultadoCategory": res_cat,
                "resultadoLabel": res_label,
                "votacao": raw_votacao,
                "isRelevant": "alta" in normalizar_chave(raw_relevancia) or "destaque" in normalizar_chave(raw_relevancia),
                "hasHerman": bool(raw_herman) or eh_herman_benjamin(raw_relator),
                "isHermanRelator": eh_herman_benjamin(raw_relator),
                "hermanManifestation": raw_herman,
                "tese": tese_limpa,
                "teseType": tese_type,
                "resumoDiscussao": raw_resumo,
            }
        )

    if not processos:
        return processos

    # Carregar ou invocar classificação semântica do Subagente Gemini 3.8 Flash
    mapa_flash: dict[int, dict[str, Any]] = {}
    if classificacao_cache_path and classificacao_cache_path.exists():
        try:
            cached_data = json.loads(classificacao_cache_path.read_text(encoding="utf-8"))
            for item in cached_data.get("classifications") or []:
                idx_item = int(item["index"])
                mapa_flash[idx_item] = {
                    "materia": obter_materia_por_id(item.get("materia_id") or item.get("materia")),
                    "relatores": item.get("relatores") or [],
                    "has_herman": bool(item.get("has_herman")),
                    "is_relevant": bool(item.get("is_relevant")),
                }
        except Exception as exc:
            logger.warning("Falha ao ler cache de classificação Flash (%s): %s", classificacao_cache_path, exc)

    if not mapa_flash and usar_subagente_flash:
        entrada_flash = [{**p, "index": p["localIndex"]} for p in processos]
        mapa_flash = classificar_processos_via_subagente_flash(entrada_flash)
        if mapa_flash and classificacao_cache_path:
            serializavel = {
                "classifications": [
                    {
                        "index": k,
                        "materia_id": v["materia"]["id"],
                        "materia": v["materia"],
                        "relatores": v["relatores"],
                        "has_herman": v["has_herman"],
                        "is_relevant": v["is_relevant"],
                    }
                    for k, v in mapa_flash.items()
                ]
            }
            classificacao_cache_path.write_text(
                json.dumps(serializavel, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    for proc in processos:
        local_idx = proc.pop("localIndex")
        proc.pop("raw_materia", None)
        proc.pop("raw_relator", None)
        proc.pop("raw_relevancia", None)

        info_flash = mapa_flash.get(local_idx) or mapa_flash.get(proc["index"])
        if info_flash:
            proc["materia"] = info_flash["materia"]
            rels = info_flash.get("relatores") or []
            proc["relatores"] = rels
            if rels:
                proc["relator"] = ", ".join(r["name"] for r in rels)
            proc["isHermanRelator"] = any(r.get("is_herman") for r in rels) or proc["isHermanRelator"]
            proc["hasHerman"] = bool(info_flash.get("has_herman")) or proc["hasHerman"] or proc["isHermanRelator"]
            proc["isRelevant"] = bool(info_flash.get("is_relevant")) or proc["isRelevant"]

    return processos


def _rotulo_parte(video: dict[str, Any], posicao: int, total: int) -> str:
    if total <= 1:
        return ""
    titulo = (video.get("title") or video.get("titulo") or "").casefold()
    if "manhã" in titulo or "manha" in titulo:
        return "Manhã"
    if "tarde" in titulo:
        return "Tarde"
    return f"Parte {posicao}"


def _ordem_parte(video: dict[str, Any]) -> tuple[int, str]:
    titulo = (video.get("title") or video.get("titulo") or "").casefold()
    if "manhã" in titulo or "manha" in titulo:
        return (0, titulo)
    if "tarde" in titulo:
        return (1, titulo)
    return (2, titulo)


def montar_sessoes_publicaveis(
    input_dir: Path = OUTPUT_DIR,
    web_transcricoes_dir: Path = WEB_TRANSCRICOES_DIR,
) -> list[dict[str, Any]]:
    """
    Lê index.json, consolida sessões por (data, órgão), copia as transcrições revisadas
    para web/transcricoes/ e retorna a lista de sessões estruturadas para o data.js.
    """
    index_path = input_dir / "index.json"
    if not index_path.exists():
        logger.warning("Arquivo index.json não encontrado em %s", index_path)
        return []

    index_data = json.loads(index_path.read_text(encoding="utf-8"))
    videos = index_data.get("videos") or []

    grupos: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for video in videos:
        orgao_slug = video.get("orgao") or ""
        upload_date = video.get("upload_date") or ""
        if orgao_slug not in ORGAOS_PUBLICAVEIS or not upload_date:
            continue

        arquivos = video.get("arquivos") or {}
        resumo_rel = arquivos.get("resumo")
        if not resumo_rel:
            continue

        resumo_path = (input_dir / resumo_rel).resolve()
        if not resumo_path.exists():
            continue

        transcricao_rev_rel = arquivos.get("transcricao_revisada") or arquivos.get("transcricao")
        transcricao_rev_path = (
            (input_dir / transcricao_rev_rel).resolve()
            if transcricao_rev_rel
            else None
        )

        grupos.setdefault((upload_date, orgao_slug), []).append(
            {
                **video,
                "_resumo_path": resumo_path,
                "_transcricao_path": transcricao_rev_path if (transcricao_rev_path and transcricao_rev_path.exists()) else None,
            }
        )

    grupos_ordenados = sorted(grupos.items(), key=lambda item: item[0][0], reverse=True)
    web_transcricoes_dir.mkdir(parents=True, exist_ok=True)

    sessoes: list[dict[str, Any]] = []

    for (upload_date, orgao_slug), grupo in grupos_ordenados:
        grupo.sort(key=_ordem_parte)
        orgao_nome = nome_orgao_canonico(orgao_slug)
        data_br = formatar_data_br(upload_date)
        session_id = f"{upload_date}_{orgao_slug}"
        title = f"{orgao_nome} — {data_br}"

        partes_video: list[dict[str, str]] = []
        todos_processos: list[dict[str, Any]] = []
        herman_highlights: list[dict[str, Any]] = []
        destaques_sessao: list[dict[str, Any]] = []
        markdown_partes: list[str] = []
        transcricao_partes: list[str] = []

        contador_proc = 1
        for pos, video in enumerate(grupo, start=1):
            rotulo = _rotulo_parte(video, pos, len(grupo))
            url_video = video.get("url") or ""
            titulo_video = video.get("title") or video.get("video_id") or ""
            partes_video.append(
                {
                    "label": rotulo or "Sessão Completa",
                    "title": titulo_video,
                    "url": url_video,
                }
            )

            conteudo_resumo = video["_resumo_path"].read_text(encoding="utf-8").strip()
            markdown_partes.append(conteudo_resumo)

            secoes = extrair_secoes_nivel2(conteudo_resumo)
            for chave, texto_sec in secoes.items():
                if "herman benjamin" in chave:
                    itens_h = extrair_itens_lista_secao(texto_sec, video_url=url_video)
                    for ih in itens_h:
                        if rotulo:
                            ih["partLabel"] = rotulo
                        herman_highlights.append(ih)
                elif "destaques" in chave:
                    itens_d = extrair_itens_lista_secao(texto_sec, video_url=url_video)
                    for idest in itens_d:
                        if rotulo:
                            idest["partLabel"] = rotulo
                        destaques_sessao.append(idest)

            resumo_p: Path = video["_resumo_path"]
            nome_cache_flash = resumo_p.name.replace("_resumo.md", "_classificacao_flash.json")
            if nome_cache_flash == resumo_p.name:
                nome_cache_flash = f"{resumo_p.stem}_classificacao_flash.json"
            cache_flash_path = resumo_p.with_name(nome_cache_flash)

            procs_parte = extrair_processos_estruturados(
                conteudo_resumo,
                video_url=url_video,
                part_label=rotulo,
                start_index=contador_proc,
                classificacao_cache_path=cache_flash_path,
            )
            contador_proc += len(procs_parte)
            todos_processos.extend(procs_parte)

            if video.get("_transcricao_path"):
                txt_transc = video["_transcricao_path"].read_text(encoding="utf-8").strip()
                if rotulo:
                    transcricao_partes.append(f"## Transmissão — {rotulo} ({titulo_video})\n\n{txt_transc}")
                else:
                    transcricao_partes.append(txt_transc)

        # Vincular processIndex aos itens de herman_highlights e garantir que nenhum processo com atuação fique de fora
        def _tokens_numericos(txt: str) -> set[str]:
            limpo = re.sub(r"(\d)\.(\d)", r"\1\2", txt or "")
            limpo = re.sub(r"(\d)\.(\d)", r"\1\2", limpo)
            return set(re.findall(r"\b\d{4,}\b", limpo))

        indices_ja_cobertos: set[int] = set()
        for h in herman_highlights:
            nums_h = _tokens_numericos(h.get("title", ""))
            chave_h = normalizar_chave(h.get("title", ""))
            for proc in todos_processos:
                if not proc["hasHerman"]:
                    continue
                nums_p = _tokens_numericos(proc["heading"])
                chave_p = normalizar_chave(proc["processNumber"])
                if (nums_h and nums_p and (nums_h & nums_p)) or (chave_p and chave_p in chave_h):
                    h["processIndex"] = proc["index"]
                    indices_ja_cobertos.add(proc["index"])
                    break

        for proc in todos_processos:
            if proc["hasHerman"] and proc["index"] not in indices_ja_cobertos:
                texto_sintese = proc["hermanManifestation"] or (
                    f"Relatoria do Min. Herman Benjamin ({proc['resultadoLabel']}). {proc['tese'] or proc['resumoDiscussao']}"
                    if proc["isHermanRelator"]
                    else proc["resumoDiscussao"]
                )
                herman_highlights.append(
                    {
                        "title": proc["heading"],
                        "text": texto_sintese,
                        "timestamp": proc["timestamp"],
                        "seconds": proc["seconds"],
                        "videoUrl": proc["videoUrl"],
                        "processIndex": proc["index"],
                        "partLabel": proc["partLabel"],
                    }
                )

        # Agregar teses para o Tesauro
        teses_sessao: list[dict[str, Any]] = []
        for proc in todos_processos:
            if proc["tese"] and len(proc["tese"]) > 8:
                teses_sessao.append(
                    {
                        "text": proc["tese"],
                        "type": proc["teseType"] or "final",
                        "processTitle": proc["heading"],
                        "processNumber": proc["processNumber"],
                        "processIndex": proc["index"],
                        "materiaId": proc["materia"]["id"],
                        "materiaCode": proc["materia"]["code"],
                        "materiaShort": proc["materia"]["short"],
                        "relator": proc["relator"],
                        "timestamp": proc["timestamp"],
                        "videoUrl": proc["videoUrl"],
                    }
                )

        # Agregar relatores únicos da sessão com papel (titular vs convocado_substituto)
        mapa_relatores: dict[str, dict[str, Any]] = {}
        for proc in todos_processos:
            for rel_obj in proc["relatores"]:
                mapa_relatores[rel_obj["name"]] = rel_obj
        relatores_sessao = list(mapa_relatores.values())

        # Agregar contagem por matéria do gabinete
        contagem_materias: dict[int, int] = {}
        for proc in todos_processos:
            m_id = proc["materia"]["id"]
            contagem_materias[m_id] = contagem_materias.get(m_id, 0) + 1

        materias_sessao = [
            {
                "id": m.id,
                "code": m.code,
                "short": m.short,
                "count": contagem_materias[m.id],
            }
            for m in MATERIAS_GABINETE
            if m.id in contagem_materias
        ]

        # Salvar arquivo público de transcrição revisada para download
        transcript_rel_url = ""
        transcript_markdown = ""
        if transcricao_partes:
            nome_arquivo_transc = f"{session_id}_transcricao_revisada.md"
            caminho_publico_transc = web_transcricoes_dir / nome_arquivo_transc
            transcript_markdown = "\n\n---\n\n".join(transcricao_partes).strip() + "\n"
            caminho_publico_transc.write_text(transcript_markdown, encoding="utf-8")
            transcript_rel_url = f"transcricoes/{nome_arquivo_transc}"

        # Estatísticas agregadas exatas
        total_procs = len(todos_processos)
        total_providos = sum(1 for p in todos_processos if p["resultadoCategory"] == "provido")
        total_desprovidos = sum(1 for p in todos_processos if p["resultadoCategory"] == "desprovido")
        total_parciais = sum(1 for p in todos_processos if p["resultadoCategory"] == "parcial")
        total_vistas_adiados = sum(
            1 for p in todos_processos if p["resultadoCategory"] in ("vista", "adiado")
        )
        total_herman = sum(1 for p in todos_processos if p["hasHerman"])
        total_relevantes = sum(1 for p in todos_processos if p["isRelevant"])

        sessoes.append(
            {
                "id": session_id,
                "title": title,
                "date": data_br,
                "isoDate": upload_date,
                "orgao": orgao_nome,
                "orgaoSlug": orgao_slug,
                "videos": partes_video,
                "videoUrls": [p["url"] for p in partes_video if p["url"]],
                "transcriptUrl": transcript_rel_url,
                "transcriptMarkdown": transcript_markdown,
                "stats": {
                    "total": total_procs,
                    "providos": total_providos,
                    "desprovidos": total_desprovidos,
                    "parciais": total_parciais,
                    "vistasAdiados": total_vistas_adiados,
                    "hermanCount": total_herman,
                    "relevantCount": total_relevantes,
                    "thesesCount": len(teses_sessao),
                },
                "hermanHighlights": herman_highlights,
                "highlights": destaques_sessao,
                "processes": todos_processos,
                "theses": teses_sessao,
                "relatores": relatores_sessao,
                "materias": materias_sessao,
                "content": "\n\n---\n\n".join(markdown_partes).strip(),
            }
        )

    return sessoes


def renderizar_data_js(sessoes: list[dict[str, Any]]) -> str:
    """Serializa as sessões e o catálogo das 15 matérias do gabinete em web/data.js."""
    catalogo_materias = [
        {"id": m.id, "code": m.code, "short": m.short}
        for m in MATERIAS_GABINETE
    ]
    materias_json = json.dumps(catalogo_materias, ensure_ascii=False, indent=2)
    sessoes_json = json.dumps(sessoes, ensure_ascii=False, indent=2)

    return (
        "// Arquivo gerado automaticamente por site_builder.py — STJ Sessões (1ª Turma e 1ª Seção)\n"
        f"const materiasGabinete = {materias_json};\n\n"
        f"const resumosData = {sessoes_json};\n\n"
        "window.materiasGabinete = materiasGabinete;\n"
        "window.resumosData = resumosData;\n"
    )


def compilar_site(
    input_dir: Path = OUTPUT_DIR,
    output_file: Path = WEB_DIR / "data.js",
    web_transcricoes_dir: Path = WEB_TRANSCRICOES_DIR,
) -> list[dict[str, Any]]:
    """Gera web/data.js e web/transcricoes/*.md a partir de data/output/."""
    sessoes = montar_sessoes_publicaveis(
        input_dir=input_dir,
        web_transcricoes_dir=web_transcricoes_dir,
    )
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(renderizar_data_js(sessoes), encoding="utf-8")
    logger.info("Base web/data.js gerada com %d sessão(ões).", len(sessoes))
    return sessoes
