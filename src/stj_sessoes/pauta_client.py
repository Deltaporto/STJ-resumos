"""Cliente e parser da Pauta de Julgamentos / Ordem do Dia oficial do STJ (Calendário de Sessões)."""

from __future__ import annotations

import io
import json
import logging
import re
from pathlib import Path
from typing import Any

import requests
from pypdf import PdfReader

from stj_sessoes.config import PAUTA_CACHE_DIR, STJ_CALENDARIO_API_BASE
from stj_sessoes.taxonomy import (
    MINISTROS_TITULARES_1A_SECAO,
    nome_orgao_canonico,
    normalizar_chave,
)
from stj_sessoes.transcript_sanitizer import formatar_data_br

logger = logging.getLogger(__name__)

# Mapeamento do slug interno para o código de órgão julgador na API do Calendário de Sessões do STJ
ORGAO_SLUG_PARA_COD_STJ: dict[str, str] = {
    "primeira_turma": "T1",
    "primeira_secao": "S1",
}

# Tipos de sessão presencial/telepresencial colegiada (exclui sessões virtuais 20, 25, 26, 28)
TIPOS_SESSAO_COLEGIADA: set[int] = {1, 2, 3, 4, 13, 16}

HEADERS_HTTP = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://calendario-sessoes.web.stj.jus.br/",
}

# Regex para cabeçalhos de processos no PDF da Pauta de Julgamentos do STJ
HEADER_PDF_RE = re.compile(
    r"(?m)^([^\n:]+?N[º°]\s*([\d.]+)\s*-\s*([A-Z]{2})\s*\((\d{4}/\d{7}-\d)\)(?:\s*-\s*(Tema[^\n]*))?)\s*$"
)


def formatar_numero_milhar(num: str | int) -> str:
    """Formata um inteiro ou string numérica com pontos de milhar (ex.: 2293252 -> '2.293.252')."""
    digitos = re.sub(r"\D", "", str(num or ""))
    if not digitos:
        return str(num or "").strip()
    invertido = digitos[::-1]
    grupos = [invertido[i : i + 3] for i in range(0, len(invertido), 3)]
    return ".".join(grupos)[::-1]


def formatar_registro_stj(num_registro: str) -> str:
    """Formata '202504238980' como '2025/0423898-0'."""
    digitos = re.sub(r"\D", "", str(num_registro or ""))
    if len(digitos) == 12:
        return f"{digitos[:4]}/{digitos[4:11]}-{digitos[11]}"
    return str(num_registro or "").strip()


def formatar_nome_ministro_canonico(nome_bruto: str) -> str:
    """Converte 'MINISTRO GURGEL DE FARIA' ou 'MINISTRA REGINA HELENA COSTA' para 'Min. Nome'."""
    if not nome_bruto:
        return ""
    limpo = re.sub(r"\s+", " ", str(nome_bruto)).strip()
    chave = normalizar_chave(limpo)

    for titular in MINISTROS_TITULARES_1A_SECAO:
        sem_prefixo = titular.replace("Min. ", "")
        if normalizar_chave(sem_prefixo) in chave:
            return titular

    if "convocad" in chave or "desembargador" in chave:
        sem_cargo = re.sub(
            r"^(?:DESEMBARGADOR(?:A)?\s+CONVOCAD[OA]|DES\.\s*CONV\.)\s*",
            "",
            limpo,
            flags=re.IGNORECASE,
        ).strip()
        return f"Des. Conv. {_capitalizar_nome_proprio(sem_cargo)}"

    sem_cargo = re.sub(
        r"^(?:MINISTR[OA]|MIN\.)\s*",
        "",
        limpo,
        flags=re.IGNORECASE,
    ).strip()
    if not sem_cargo:
        return limpo
    return f"Min. {_capitalizar_nome_proprio(sem_cargo)}"


def _capitalizar_nome_proprio(nome: str) -> str:
    preposicoes = {"de", "da", "do", "das", "dos", "e"}
    palavras = nome.lower().split()
    resultado = []
    for idx, p in enumerate(palavras):
        if idx > 0 and p in preposicoes:
            resultado.append(p)
        else:
            resultado.append(p.capitalize())
    return " ".join(resultado)


_SUBSTITUICOES_CLASSE_PDF: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bEMBARGOS DE DIVERG[ÊE]NCIA EM AGRAVO EM RECURSO ESPECIAL\b", re.IGNORECASE), "EAREsp"),
    (re.compile(r"\bEMBARGOS DE DIVERG[ÊE]NCIA EM (?:RECURSO ESPECIAL|RESP)\b", re.IGNORECASE), "EREsp"),
    (re.compile(r"\bAGRAVO EM RECURSO ESPECIAL\b", re.IGNORECASE), "AREsp"),
    (re.compile(r"\bRECURSO EM MANDADO DE SEGURAN[ÇC]A\b", re.IGNORECASE), "RMS"),
    (re.compile(r"\bRECURSO ESPECIAL\b", re.IGNORECASE), "REsp"),
    (re.compile(r"\bMANDADO DE SEGURAN[ÇC]A\b", re.IGNORECASE), "MS"),
    (re.compile(r"\bCONFLITO DE COMPET[ÊE]NCIA\b", re.IGNORECASE), "CC"),
    (re.compile(r"\bA[ÇC][ÃA]O RESCIS[ÓO]RIA\b", re.IGNORECASE), "AR"),
    (re.compile(r"\bTUTELA CAUTELAR ANTECEDENTE\b", re.IGNORECASE), "TutCautAnt"),
    (re.compile(r"\bTUTELA PROVIS[ÓO]RIA\b", re.IGNORECASE), "TutProv"),
    (re.compile(r"\bPETI[ÇC][ÃA]O\b", re.IGNORECASE), "Pet"),
    (re.compile(r"\bRECLAMA[ÇC][ÃA]O\b", re.IGNORECASE), "Rcl"),
    (re.compile(r"\bSUSPENS[ÃA]O DE LIMINAR E DE SENTEN[ÇC]A\b", re.IGNORECASE), "SLS"),
    (re.compile(r"\bSUSPENS[ÃA]O DE SEGURAN[ÇC]A\b", re.IGNORECASE), "SS"),
    (re.compile(r"\bINCIDENTE DE ASSUN[ÇC][ÃA]O DE COMPET[ÊE]NCIA\b", re.IGNORECASE), "IAC"),
    (re.compile(r"\bAGRAVO INTERNO\b", re.IGNORECASE), "AgInt"),
    (re.compile(r"\bAGRAVO REGIMENTAL\b", re.IGNORECASE), "AgRg"),
    (re.compile(r"\bEMBARGOS DE DECLARA[ÇC][ÃA]O\b", re.IGNORECASE), "EDcl"),
]


def abreviar_classe_processual(classe: str) -> str:
    """Converte nomes de classes por extenso do PDF para siglas canônicas do STJ."""
    texto = re.sub(r"\s+", " ", str(classe or "")).strip()
    if not texto:
        return ""
    for padrao, sigla in _SUBSTITUICOES_CLASSE_PDF:
        texto = padrao.sub(sigla, texto)
    return texto


def construir_identificacao_processo(
    classe: str,
    num_proc_classe: str | int,
    uf: str = "",
) -> str:
    """Constrói a identificação curta canônica (ex.: 'REsp 2.293.252/MG')."""
    classe_limpa = abreviar_classe_processual(classe)
    num_fmt = formatar_numero_milhar(num_proc_classe)
    uf_limpa = str(uf or "").strip().upper()
    base = f"{classe_limpa} {num_fmt}".strip()
    if uf_limpa:
        return f"{base}/{uf_limpa}"
    return base



def parsear_pdf_pauta(pdf_bytes: bytes) -> dict[str, dict[str, Any]]:
    """
    Extrai os metadados processuais detalhados do PDF oficial de 'PAUTA DE JULGAMENTOS'
    (UF, cabeçalho com cadeia completa de classes, Tema Repetitivo, Relator original,
    Partes e Advogados), indexados pelo número de registro de 12 dígitos.
    """
    if not pdf_bytes:
        return {}

    reader = PdfReader(io.BytesIO(pdf_bytes))
    paginas_texto: list[str] = []
    for page in reader.pages:
        paginas_texto.append(page.extract_text() or "")
    texto_completo = "\n".join(paginas_texto)

    # Remover cabeçalhos/rodapés repetitivos das páginas do PDF
    texto_limpo = re.sub(r"(?m)^\s*P\s*á\s*g\s*i\s*n\s*a\s+\d+\s+d\s*e\s+\d+\s*$", "", texto_completo)
    texto_limpo = re.sub(r"(?m)^\s*PAUTA DE JULGAMENTOS\s*$", "", texto_limpo)
    texto_limpo = re.sub(r"(?m)^\s*SUPERIOR TRIBUNAL DE JUSTIÇA\s*$", "", texto_limpo)

    # Unir quebras de linha em cabeçalhos longos antes do registro (YYYY/NNNNNNN-D) ou Tema Repetitivo
    texto_limpo = re.sub(r"\n\s*(\(\d{4}/\d{7}-\d\))", r" \1", texto_limpo)
    texto_limpo = re.sub(r"(-\s*Tema\s+Repetitivo)\s*\n\s*(n\.\s*\d+)", r"\1 \2", texto_limpo)

    matches = list(HEADER_PDF_RE.finditer(texto_limpo))
    resultado: dict[str, dict[str, Any]] = {}

    for idx, match in enumerate(matches):
        cabecalho = re.sub(r"\s+", " ", match.group(1)).strip()
        numero_fmt = match.group(2).strip()
        uf = match.group(3).strip().upper()
        reg_fmt = match.group(4).strip()
        tema_rep = re.sub(r"\s+", " ", match.group(5) or "").strip()
        num_registro = re.sub(r"\D", "", reg_fmt)

        # Extrair cadeia completa de classe antes de "Nº" (ex.: "AgInt nos EDcl no AREsp")
        match_classe = re.match(r"^(.+?)\s+N[º°]\s*[\d.]+", cabecalho)
        classe_completa = abreviar_classe_processual(match_classe.group(1).strip()) if match_classe else ""

        inicio_bloco = match.end()
        fim_bloco = matches[idx + 1].start() if idx + 1 < len(matches) else len(texto_limpo)
        bloco = texto_limpo[inicio_bloco:fim_bloco].strip()

        relator_pdf = ""
        partes: list[dict[str, str]] = []
        advogados: list[str] = []

        for linha in bloco.splitlines():
            linha_s = linha.strip()
            if not linha_s or ":" not in linha_s:
                continue
            rotulo, valor = linha_s.split(":", 1)
            rotulo_u = rotulo.strip().upper()
            valor_s = re.sub(r"\s+", " ", valor).strip()
            if not valor_s:
                continue

            if rotulo_u == "RELATOR":
                relator_pdf = formatar_nome_ministro_canonico(valor_s)
            elif rotulo_u in (
                "RECORRENTE",
                "RECORRIDO",
                "AGRAVANTE",
                "AGRAVADO",
                "EMBARGANTE",
                "EMBARGADO",
                "IMPETRANTE",
                "IMPETRADO",
                "AUTOR",
                "RÉU",
                "REU",
                "REQUERENTE",
                "REQUERIDO",
                "SUSCITANTE",
                "SUSCITADO",
                "INTERESSADO",
                "CUSTOS LEGIS",
            ):
                partes.append({"papel": rotulo_u.title(), "nome": valor_s})
            elif rotulo_u in ("ADVOGADO", "ADVOGADOS", "ADVOGADA", "PROCURADOR", "DEFENSORIA"):
                advogados.append(valor_s)

        resultado[num_registro] = {
            "num_registro": num_registro,
            "registro_formatado": reg_fmt,
            "uf": uf,
            "cabecalho": cabecalho,
            "classe_completa": classe_completa,
            "numero_formatado": numero_fmt,
            "identificacao_curta": construir_identificacao_processo(classe_completa, numero_fmt, uf),
            "tema_repetitivo": tema_rep,
            "relator_pdf": relator_pdf,
            "partes": partes,
            "advogados": advogados,
        }

    return resultado


class PautaClient:
    """Cliente para consulta e cache da Pauta de Julgamentos / Ordem do Dia do STJ."""

    def __init__(
        self,
        api_base: str = STJ_CALENDARIO_API_BASE,
        cache_dir: Path = PAUTA_CACHE_DIR,
        timeout: int = 25,
    ) -> None:
        self.api_base = api_base.rstrip("/")
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(HEADERS_HTTP)

    def _caminho_cache_json(self, data_iso: str, orgao_slug: str) -> Path:
        return self.cache_dir / f"{data_iso}_{orgao_slug}_pauta.json"

    def _caminho_cache_pdf(self, data_iso: str, orgao_slug: str, seq_doc: int | str) -> Path:
        return self.cache_dir / f"{data_iso}_{orgao_slug}_doc_{seq_doc}.pdf"

    def obter_caminho_cache_pdf(self, data_iso: str, orgao_slug: str) -> Path | None:
        """Localiza o arquivo PDF original da pauta no diretório de cache."""
        canonico = self.cache_dir / f"{data_iso}_{orgao_slug}_pauta.pdf"
        if canonico.exists() and canonico.stat().st_size > 0:
            return canonico
        candidatos = sorted(self.cache_dir.glob(f"{data_iso}_{orgao_slug}_doc_*.pdf"))
        for cand in candidatos:
            if cand.is_file() and cand.stat().st_size > 0:
                return cand
        return None

    def obter_pauta_sessao(
        self,
        data_iso: str,
        orgao_slug: str,
        force: bool = False,
    ) -> dict[str, Any] | None:
        """
        Obtém a pauta estruturada completa (Ordem do Dia + PDF de Pauta + Sustentações Orais)
        para uma sessão da Primeira Turma ('primeira_turma') ou Primeira Seção ('primeira_secao')
        na data `YYYY-MM-DD`.
        """
        if not data_iso or orgao_slug not in ORGAO_SLUG_PARA_COD_STJ:
            return None

        cache_json = self._caminho_cache_json(data_iso, orgao_slug)
        if not force and cache_json.exists():
            try:
                dados = json.loads(cache_json.read_text(encoding="utf-8"))
                if isinstance(dados, dict) and dados.get("itens") is not None:
                    logger.info("Pauta carregada do cache local: %s", cache_json.name)
                    return dados
            except Exception as exc:
                logger.warning("Falha ao ler cache de pauta %s: %s", cache_json, exc)

        cod_orgao = ORGAO_SLUG_PARA_COD_STJ[orgao_slug]
        data_br = formatar_data_br(data_iso)

        try:
            # 1. Consultar cronograma do dia (dataInicio e dataFim exigem formato DD/MM/YYYY e tipo=TODOS)
            resp_cron = self.session.get(
                f"{self.api_base}/cronograma-sessao",
                params={"dataInicio": data_br, "dataFim": data_br, "tipo": "TODOS"},
                timeout=self.timeout,
            )
            resp_cron.raise_for_status()
            payload_cron = resp_cron.json() or {}
        except Exception as exc:
            logger.warning("Não foi possível consultar o cronograma do STJ para %s (%s): %s", data_br, orgao_slug, exc)
            return None

        cronogramas = payload_cron.get("cronogramas") or []
        sessao_alvo: dict[str, Any] | None = None
        for c in cronogramas:
            orgao_obj = c.get("orgaoJulgador") or {}
            tipo_obj = c.get("tipoSessao") or {}
            if (
                orgao_obj.get("codOrgaoJgdr") == cod_orgao
                and c.get("dataCronogramaSessao") == data_iso
                and int(tipo_obj.get("seq") or 0) in TIPOS_SESSAO_COLEGIADA
            ):
                sessao_alvo = c
                break

        if not sessao_alvo:
            logger.info("Nenhuma sessão colegiada presencial encontrada no calendário STJ para %s em %s.", orgao_slug, data_br)
            return None

        seq_sessao = int(sessao_alvo["seq"])
        tipo_sessao = (sessao_alvo.get("tipoSessao") or {}).get("nomeSessao") or "Ordinária"
        hora_inicio = sessao_alvo.get("horaInicioSessao") or ""

        # 2. Consultar documentos oficiais (Pauta PDF e Ata PDF)
        documentos: list[dict[str, Any]] = []
        url_pauta_pdf = ""
        seq_doc_pauta: int | None = None
        url_ata_pdf = ""

        try:
            resp_docs = self.session.get(
                f"{self.api_base}/sessoes-julgamento/{seq_sessao}/documentos",
                timeout=self.timeout,
            )
            if resp_docs.ok:
                docs_raw = resp_docs.json() or []
                for d in docs_raw:
                    seq_doc = d.get("seqDocumento")
                    tipo_doc = str(d.get("tipoDocumento") or "").strip()
                    cod_tipo = int(d.get("codTipoDocumento") or 0)
                    url_doc = str(d.get("urlDocumento") or "").strip()
                    if not url_doc and seq_doc:
                        url_doc = f"{self.api_base}/sessoes-julgamento/documentos/{seq_doc}/pdf"
                    documentos.append(
                        {
                            "seq_documento": seq_doc,
                            "cod_tipo": cod_tipo,
                            "tipo": tipo_doc,
                            "url": url_doc,
                        }
                    )
                    if (cod_tipo == 40 or "PAUTA" in tipo_doc.upper()) and not url_pauta_pdf:
                        url_pauta_pdf = url_doc
                        seq_doc_pauta = seq_doc
                    elif (cod_tipo == 42 or "ATA" in tipo_doc.upper()) and not url_ata_pdf:
                        url_ata_pdf = url_doc
        except Exception as exc:
            logger.warning("Falha ao buscar documentos da sessão %d: %s", seq_sessao, exc)

        # 3. Baixar e parsear o PDF da Pauta de Julgamentos (para UF, Partes, Tema Repetitivo e Relator original)
        mapa_pdf: dict[str, dict[str, Any]] = {}
        if url_pauta_pdf and seq_doc_pauta:
            cache_pdf = self._caminho_cache_pdf(data_iso, orgao_slug, seq_doc_pauta)
            pdf_bytes = b""
            if not force and cache_pdf.exists():
                pdf_bytes = cache_pdf.read_bytes()
            else:
                try:
                    resp_pdf = self.session.get(url_pauta_pdf, timeout=self.timeout)
                    if resp_pdf.ok and resp_pdf.content.startswith(b"%PDF"):
                        pdf_bytes = resp_pdf.content
                        cache_pdf.write_bytes(pdf_bytes)
                except Exception as exc:
                    logger.warning("Falha ao baixar PDF da pauta (%s): %s", url_pauta_pdf, exc)

            if pdf_bytes:
                try:
                    (self.cache_dir / f"{data_iso}_{orgao_slug}_pauta.pdf").write_bytes(pdf_bytes)
                except Exception:
                    pass
                try:
                    mapa_pdf = parsear_pdf_pauta(pdf_bytes)
                except Exception as exc:
                    logger.warning("Falha ao parsear PDF da pauta (%s): %s", seq_doc_pauta, exc)

        # 4. Consultar processos da Ordem do Dia
        processos_api: list[dict[str, Any]] = []
        try:
            resp_procs = self.session.get(
                f"{self.api_base}/sessoes-julgamento/{seq_sessao}/processos",
                timeout=self.timeout,
            )
            if resp_procs.ok:
                processos_api = resp_procs.json() or []
        except Exception as exc:
            logger.warning("Falha ao consultar /processos da sessão %d: %s", seq_sessao, exc)

        # 5. Consultar sustentações orais
        sustentacoes_api: list[dict[str, Any]] = []
        try:
            resp_so = self.session.get(
                f"{self.api_base}/sessoes-julgamento/{seq_sessao}/sustentacoes-orais",
                timeout=self.timeout,
            )
            if resp_so.ok:
                sustentacoes_api = resp_so.json() or []
        except Exception as exc:
            logger.warning("Falha ao consultar /sustentacoes-orais da sessão %d: %s", seq_sessao, exc)

        sustentacoes_por_registro: dict[str, list[dict[str, str]]] = {}
        for so in sustentacoes_api:
            reg = re.sub(r"\D", "", str(so.get("numRegistro") or ""))
            if not reg:
                continue
            sustentacoes_por_registro.setdefault(reg, []).append(
                {
                    "advogado": re.sub(r"\s+", " ", str(so.get("nomeAdvogado") or "")).strip(),
                    "partes": re.sub(r"\s+", " ", str(so.get("partes") or "")).strip(),
                }
            )

        # 6. Unificar e enriquecer itens da Ordem do Dia
        itens_pauta: list[dict[str, Any]] = []
        processos_api_ordenados = sorted(
            processos_api,
            key=lambda p: int(p.get("numOrdemDia") or 9999),
        )

        for p_raw in processos_api_ordenados:
            num_ordem = int(p_raw.get("numOrdemDia") or 0)
            num_registro = re.sub(r"\D", "", str(p_raw.get("numRegistro") or ""))
            sg_classe = str(p_raw.get("sgClasse") or "").strip()
            num_proc_classe = str(p_raw.get("numProcClasse") or "").strip()
            ministro_sessao = formatar_nome_ministro_canonico(str(p_raw.get("nomeMinistro") or ""))
            categoria = str(p_raw.get("descCategJulgamento") or "").strip()
            ind_categoria = str(p_raw.get("indCategoria") or "").strip()
            assunto = str(p_raw.get("descAssunto") or "").strip()
            resultado_oficial = str(p_raw.get("descResultadoJulgamento") or "").strip()
            segredo = bool(p_raw.get("segredoJustica"))

            info_pdf = mapa_pdf.get(num_registro) or {}
            uf = info_pdf.get("uf") or ""
            classe_completa = info_pdf.get("classe_completa") or sg_classe
            numero_fmt = info_pdf.get("numero_formatado") or formatar_numero_milhar(num_proc_classe)
            processo_id = construir_identificacao_processo(classe_completa, num_proc_classe, uf)
            tema_rep = info_pdf.get("tema_repetitivo") or ""
            relator_pdf = info_pdf.get("relator_pdf") or ""

            relator_final = relator_pdf or ministro_sessao
            vistor_final = ""
            if (
                ind_categoria == "VV"
                and relator_pdf
                and ministro_sessao
                and normalizar_chave(relator_pdf) != normalizar_chave(ministro_sessao)
            ):
                vistor_final = ministro_sessao

            partes_item = info_pdf.get("partes") or []
            advogados_item = info_pdf.get("advogados") or []
            sustentacoes_item = sustentacoes_por_registro.get(num_registro) or []

            itens_pauta.append(
                {
                    "item": num_ordem,
                    "num_registro": num_registro,
                    "registro_formatado": info_pdf.get("registro_formatado") or formatar_registro_stj(num_registro),
                    "sg_classe": sg_classe,
                    "classe_completa": classe_completa,
                    "num_proc_classe": num_proc_classe,
                    "numero_formatado": numero_fmt,
                    "uf": uf,
                    "processo": processo_id,
                    "cabecalho_pdf": info_pdf.get("cabecalho") or "",
                    "tema_repetitivo": tema_rep,
                    "relator": relator_final,
                    "vistor": vistor_final,
                    "ministro_sessao": ministro_sessao,
                    "categoria": categoria,
                    "ind_categoria": ind_categoria,
                    "assunto": assunto,
                    "resultado_oficial": resultado_oficial,
                    "segredo_justica": segredo,
                    "partes": partes_item,
                    "advogados": advogados_item,
                    "sustentacoes_orais": sustentacoes_item,
                }
            )

        pauta_consolidada: dict[str, Any] = {
            "seq_sessao": seq_sessao,
            "orgao_slug": orgao_slug,
            "cod_orgao_stj": cod_orgao,
            "nome_orgao": nome_orgao_canonico(orgao_slug),
            "data_iso": data_iso,
            "data_br": data_br,
            "tipo_sessao": tipo_sessao,
            "hora_inicio": hora_inicio,
            "url_pauta_pdf": url_pauta_pdf,
            "seq_doc_pauta": seq_doc_pauta,
            "tem_pdf_original": bool(pdf_bytes or (self.obter_caminho_cache_pdf(data_iso, orgao_slug) is not None)),
            "url_ata_pdf": url_ata_pdf,
            "documentos": documentos,
            "total_itens": len(itens_pauta),
            "total_sustentacoes": len(sustentacoes_api),
            "itens": itens_pauta,
        }

        try:
            cache_json.write_text(
                json.dumps(pauta_consolidada, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.warning("Não foi possível salvar cache JSON da pauta (%s): %s", cache_json, exc)

        return pauta_consolidada


def formatar_pauta_para_prompt(pauta: dict[str, Any] | None) -> str:
    """
    Formata a Pauta / Ordem do Dia oficial da sessão em texto conciso e estruturado
    para servir como gabarito oficial nos prompts de saneamento de transcrição e resumo jurídico.
    """
    if not pauta or not pauta.get("itens"):
        return ""

    linhas: list[str] = [
        f"PAUTA E ORDEM DO DIA OFICIAL DO STJ — {pauta.get('nome_orgao')} ({pauta.get('data_br')}) — {pauta.get('total_itens')} itens:",
        "Use esta lista oficial como GABARITO para grafar corretamente os números dos processos, classes processuais, UFs, temas repetitivos, relatores, nomes das partes/advogados e identificar processos apregoados apenas pelo número de item da pauta (ex.: 'Item 28 da pauta'):",
    ]

    for it in pauta["itens"]:
        partes_resumo = "; ".join(
            f"{p['papel']}: {p['nome']}" for p in (it.get("partes") or [])[:4]
        )
        so_resumo = ", ".join(
            s["advogado"] for s in (it.get("sustentacoes_orais") or []) if s.get("advogado")
        )
        tema_str = f" [{it['tema_repetitivo']}]" if it.get("tema_repetitivo") else ""
        vistor_str = f" (Vistor: {it['vistor']})" if it.get("vistor") else ""
        assunto_str = f" | Assunto: {it['assunto']}" if it.get("assunto") else ""
        resultado_str = f" | Resultado na Ata/Sistema: {it['resultado_oficial']}" if it.get("resultado_oficial") else ""
        partes_str = f" | Partes: {partes_resumo}" if partes_resumo else ""
        so_str = f" | Sustentação Oral inscrita: {so_resumo}" if so_str_val(so_resumo) else ""

        linhas.append(
            f"- Item {it['item']:02d} [{it.get('categoria') or 'Pauta'}]: "
            f"{it['processo']}{tema_str} — Rel.: {it.get('relator')}{vistor_str}"
            f"{assunto_str}{resultado_str}{partes_str}{so_str}"
        )

    return "\n".join(linhas)


def so_str_val(val: str) -> bool:
    return bool(val and val.strip())


def gerar_markdown_pauta(pauta: dict[str, Any]) -> str:
    """Gera um documento Markdown completo com a Pauta e Ordem do Dia da sessão."""
    if not pauta:
        return ""

    nome_orgao = pauta.get("nome_orgao") or ""
    data_br = pauta.get("data_br") or ""
    tipo_sessao = pauta.get("tipo_sessao") or "Ordinária"
    url_pauta = pauta.get("url_pauta_pdf") or ""
    url_ata = pauta.get("url_ata_pdf") or ""
    itens = pauta.get("itens") or []

    linhas = [
        f"# Pauta de Julgamentos e Ordem do Dia — {nome_orgao} ({data_br})",
        "",
        f"- **Órgão Julgador:** {nome_orgao} — Superior Tribunal de Justiça",
        f"- **Data da Sessão:** {data_br} ({tipo_sessao})",
        f"- **Total de Processos em Pauta:** {len(itens)}",
        f"- **Inscrições para Sustentação Oral:** {pauta.get('total_sustentacoes', 0)}",
    ]
    if url_pauta:
        linhas.append(f"- **Pauta Oficial (PDF):** [Baixar Pauta Oficial do STJ]({url_pauta})")
    if url_ata:
        linhas.append(f"- **Ata de Julgamento (PDF):** [Baixar Ata de Julgamento do STJ]({url_ata})")

    linhas.extend(
        [
            "",
            "---",
            "",
            "## Quadro Sinótico da Ordem do Dia",
            "",
            "| Item | Processo | Categoria | Relator / Vistor | Assunto Oficial | Resultado Oficial |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |",
        ]
    )

    for it in itens:
        proc_label = it.get("processo") or ""
        if it.get("tema_repetitivo"):
            proc_label = f"{proc_label} ({it['tema_repetitivo']})"
        rel_label = it.get("relator") or ""
        if it.get("vistor"):
            rel_label = f"{rel_label} (Vista: {it['vistor']})"
        linhas.append(
            f"| **{it['item']:02d}** | `{proc_label}` | {it.get('categoria') or '-'} | "
            f"{rel_label} | {it.get('assunto') or '-'} | {it.get('resultado_oficial') or '-'} |"
        )

    linhas.extend(["", "---", "", "## Detalhamento dos Processos Pautados", ""])

    for it in itens:
        tema_str = f" — {it['tema_repetitivo']}" if it.get("tema_repetitivo") else ""
        linhas.append(f"### Item {it['item']:02d} — {it.get('processo')}{tema_str}")
        linhas.append(f"- **Registro STJ:** `{it.get('registro_formatado')}`")
        linhas.append(f"- **Categoria na Sessão:** {it.get('categoria') or 'Pauta'}")
        linhas.append(f"- **Relator:** {it.get('relator') or 'Não informado'}")
        if it.get("vistor"):
            linhas.append(f"- **Voto-Vista:** {it['vistor']}")
        if it.get("assunto"):
            linhas.append(f"- **Assunto Oficial:** {it['assunto']}")
        if it.get("resultado_oficial"):
            linhas.append(f"- **Resultado Oficial:** {it['resultado_oficial']}")
        if it.get("partes"):
            partes_fmt = "; ".join(f"{p['papel']}: {p['nome']}" for p in it["partes"])
            linhas.append(f"- **Partes:** {partes_fmt}")
        if it.get("sustentacoes_orais"):
            so_fmt = "; ".join(
                f"{s['advogado']} ({s['partes']})" if s.get("partes") else s["advogado"]
                for s in it["sustentacoes_orais"]
            )
            linhas.append(f"- **Sustentações Orais Inscritas:** {so_fmt}")
        linhas.append("")

    return "\n".join(linhas).strip() + "\n"


def _extrair_numeros_processo(texto: str) -> set[str]:
    """Extrai radicais numéricos de processos (5 a 8 dígitos) ignorando pontos de milhar."""
    if not texto:
        return set()
    sem_pontos = re.sub(r"(\d)\.(\d)", r"\1\2", texto)
    sem_pontos = re.sub(r"(\d)\.(\d)", r"\1\2", sem_pontos)
    return set(re.findall(r"\b\d{5,8}\b", sem_pontos))


def _extrair_itens_mencionados(texto: str) -> set[int]:
    """Extrai referências explícitas a 'Item N' ou 'Itens N e M'."""
    if not texto:
        return set()
    itens: set[int] = set()
    for m in re.finditer(r"\bitem\s+(\d{1,3})\b", texto, re.IGNORECASE):
        itens.add(int(m.group(1)))
    for m in re.finditer(r"\bitens\s+(\d{1,3})\s*(?:e|,|a)\s*(\d{1,3})\b", texto, re.IGNORECASE):
        itens.add(int(m.group(1)))
        itens.add(int(m.group(2)))
    return itens


def vincular_processos_julgados_com_pauta(
    processos_julgados: list[dict[str, Any]],
    pauta: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Cruza os processos julgados extraídos do resumo com os itens da Pauta oficial.
    - Enriquecer cada `proc` em `processos_julgados` com `pautaItems` (lista de itens da pauta correspondentes),
      `assuntoOficial`, `partes`, `temaRepetitivo` e `resultadoOficial`.
    - Enriquecer cada item em `pauta['itens']` com `matchedProcessIndex`, `timestamp` e `videoUrl`
      quando tiver sido debatido individualmente na sessão.
    """
    if not pauta or not pauta.get("itens"):
        return pauta

    itens_pauta: list[dict[str, Any]] = pauta["itens"]

    # Índice reverso por número do processo (ex.: '2293252') e por número de item da pauta
    por_numero: dict[str, list[dict[str, Any]]] = {}
    por_item: dict[int, dict[str, Any]] = {}

    for it in itens_pauta:
        it["matchedProcessIndex"] = None
        it["timestamp"] = ""
        it["videoUrl"] = ""
        num_limpo = re.sub(r"\D", "", str(it.get("num_proc_classe") or ""))
        if num_limpo:
            por_numero.setdefault(num_limpo, []).append(it)
        if it.get("item"):
            por_item[int(it["item"])] = it

    for proc in processos_julgados:
        texto_busca = f"{proc.get('heading', '')} {proc.get('processNumber', '')} {proc.get('resumoDiscussao', '')}"
        numeros_proc = _extrair_numeros_processo(f"{proc.get('heading', '')} {proc.get('processNumber', '')}")
        if not numeros_proc:
            numeros_proc = _extrair_numeros_processo(proc.get("resumoDiscussao", ""))

        itens_encontrados: list[dict[str, Any]] = []
        vistos_item_num: set[int] = set()

        for num in numeros_proc:
            for it in por_numero.get(num, []):
                if it["item"] not in vistos_item_num:
                    itens_encontrados.append(it)
                    vistos_item_num.add(it["item"])

        if not itens_encontrados:
            for item_num in _extrair_itens_mencionados(texto_busca):
                if item_num in por_item and item_num not in vistos_item_num:
                    itens_encontrados.append(por_item[item_num])
                    vistos_item_num.add(item_num)

        itens_encontrados.sort(key=lambda x: x["item"])

        resumo_itens_proc = []
        for it in itens_encontrados:
            if it["matchedProcessIndex"] is None:
                it["matchedProcessIndex"] = proc["index"]
                it["timestamp"] = proc.get("timestamp") or ""
                it["videoUrl"] = proc.get("videoUrl") or ""
            resumo_itens_proc.append(
                {
                    "item": it["item"],
                    "processo": it["processo"],
                    "categoria": it.get("categoria") or "",
                    "assunto": it.get("assunto") or "",
                    "temaRepetitivo": it.get("tema_repetitivo") or "",
                    "resultadoOficial": it.get("resultado_oficial") or "",
                    "partes": it.get("partes") or [],
                }
            )

        proc["pautaItems"] = resumo_itens_proc
        if resumo_itens_proc:
            primeiro = resumo_itens_proc[0]
            proc["assuntoOficial"] = primeiro["assunto"]
            proc["temaRepetitivo"] = primeiro["temaRepetitivo"]
            proc["resultadoOficial"] = primeiro["resultadoOficial"]
            proc["partes"] = primeiro["partes"]
        else:
            proc["assuntoOficial"] = ""
            proc["temaRepetitivo"] = ""
            proc["resultadoOficial"] = ""
            proc["partes"] = []

    return pauta
