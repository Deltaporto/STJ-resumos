"""Saneamento, organização estrutural e revisão de transcrições das sessões do STJ."""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from stj_sessoes.config import (
    DEFAULT_MAX_CHUNK_THREADS,
    LIMITE_CARACTERES_SANEAMENTO_CHUNK,
)
from stj_sessoes.gemini_client import GeminiClient
from stj_sessoes.taxonomy import nome_orgao_canonico
from stj_sessoes.youtube_client import VideoInfo, formatar_duracao

logger = logging.getLogger(__name__)

LINHA_TIMESTAMP_RE = re.compile(r"^\[(\d{2}:\d{2}:\d{2})\]\s*(.+)$")

# Frases típicas de vinhetas institucionais e programação pré-sessão da TV Justiça exibidas antes da abertura da sessão
PADROES_VINHETA_INSTITUCIONAL = re.compile(
    r"(?:"
    r"dificuldade\s+de\s+leitura\.\s*a\s+ouvidoria|"
    r"atendimento\s+em\s+libras|"
    r"disponibilizadas\s+em\s+v[ií]deos\s+no\s+youtube|"
    r"arquivos\s+de\s+[aá]udio\s+no\s+spotify|"
    r"hashtag\s+para\s+todos\s+verem|"
    r"coordenadoria\s+de\s+acessibilidade\s+e\s+inclus[aã]o|"
    r"um\s+tribunal\s+acess[ií]vel\s+[eé]\s+um\s+tribunal\s+cidad[aã]o|"
    r"lan[cç]ou\s+o\s+resumo\s+em\s+texto\s+simplificado|"
    r"pacto\s+nacional\s+do\s+judici[aá]rio\s+pela\s+linguagem\s+simples|"
    r"revista\s+de\s+estudos\s+jur[ií]dicos\s+do\s+superior\s+tribunal\s+de\s+justi[cç]a|"
    r"rejuri\s+stj\s+[eé]\s+voltada|"
    r"programa\s+rej[uú]ri|"
    r"chamamento\s+p[uú]blico\s+para\s+o\s+envio\s+de\s+artigos|"
    r"coordenadoria\s+de\s+tv\s+e\s+r[aá]dio|"
    r"superior\s+tribunal\s+de\s+justi[cç]a\s+apresenta|"
    r"biblioteca\s+ministro\s+oscar\s+saraiva|"
    r"reportagem\s+especial|"
    r"espa[cç]o\s+cultural\s+do\s+stj|"
    r"c[aã]es-guia|c[aã]o-guia"
    r")",
    re.IGNORECASE,
)

# Marcadores de abertura real da sessão colegiada
PADROES_ABERTURA_SESSAO = re.compile(
    r"\b(?:"
    r"declaro\s+abert[oa]s?\s+(?:a\s+sess[aã]o|os\s+trabalhos)|"
    r"aberta\s+a\s+sess[aã]o|"
    r"invocando\s+a\s+prote[cç][aã]o\s+de\s+deus|"
    r"iniciamos\s+(?:a\s+sess[aã]o|os\s+trabalhos)|"
    r"vamos\s+iniciar\s+(?:a\s+sess[aã]o|os\s+trabalhos)|"
    r"damos\s+in[ií]cio\s+[aà]\s+sess[aã]o|"
    r"apregoa-se\s+o\s+item|"
    r"chamo\s+a\s+julgamento|"
    r"indago\s+da\s+senhora\s+secret[aá]ria|"
    r"solicito\s+[aà]\s+senhora\s+secret[aá]ria|"
    r"leitura\s+da\s+ata|ata\s+da\s+sess[aã]o|"
    r"havendo\s+qu[oó]rum|h[aá]\s+qu[oó]rum"
    r")\b",
    re.IGNORECASE,
)

# Substituições determinísticas para corrigir distorções fonéticas das legendas automáticas
GLOSSARIO_FONETICO_STJ: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?h?erm[aã][nm]\s+benjam[ií][nm]\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:s[eé]rgio\s+(?:kukina|cuquina|cucina|coquina)|s[eé]rgico\s+quina)\b", re.IGNORECASE), "Min. Sérgio Kukina"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:gurgel\s+de\s+farias?)\b", re.IGNORECASE), "Min. Gurgel de Faria"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:regina\s+h?elena(?:\s+costa)?)\b", re.IGNORECASE), "Min. Regina Helena Costa"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:paulo\s+s[eé]rgio\s+domingue[sz])\b", re.IGNORECASE), "Min. Paulo Sérgio Domingues"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:benedito\s+gon[cç]alves)\b", re.IGNORECASE), "Min. Benedito Gonçalves"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:francisco\s+falc[aã]o)\b", re.IGNORECASE), "Min. Francisco Falcão"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:mauro\s+campbell?(?:\s+marques)?)\b", re.IGNORECASE), "Min. Mauro Campbell Marques"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:teodoro\s+silva\s+santos)\b", re.IGNORECASE), "Min. Teodoro Silva Santos"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:afr[aâ]n(?:io)?\s+vilela)\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\b(?:ministr[oa]\s+|min\.\s+)?(?:maria\s+th?ere[sz]a(?:\s+de\s+assis\s+moura)?)\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\bs[uú]mula\s+sete\b", re.IGNORECASE), "Súmula 7"),
    (re.compile(r"\bs[uú]mula\s+oitenta\s+e\s+tr[eê]s\b", re.IGNORECASE), "Súmula 83"),
    (re.compile(r"\bs[uú]mula\s+duzentos\s+e\s+onze\b", re.IGNORECASE), "Súmula 211"),
    (re.compile(r"\b(?:hashag|sqr\s+code)\b", re.IGNORECASE), ""),
    (re.compile(r"\[(?:m[uú]sica|risos|palmas|aplausos|tosse|roncando|suspiro|inaud[ií]vel)\]", re.IGNORECASE), ""),
    (re.compile(r"^>>+\s*", re.MULTILINE), ""),
)

PADROES_NOVO_BLOCO = re.compile(
    r"(?:^>>\s*|\b(?:chamo\s+a\s+julgamento|item\s+\d+\s+da\s+pauta|apregoa-se|passo\s+a\s+palavra|com\s+a\s+palavra|pe[cç]o\s+vista|quest[aã]o\s+de\s+ordem)\b)",
    re.IGNORECASE,
)

PROMPT_REVISAO_TRANSCRICAO = """Você é um revisor taquigráfico especializado nas sessões da Primeira Turma e da Primeira Seção do Superior Tribunal de Justiça (STJ).

Sua tarefa é revisar e sanear o trecho de transcrição abaixo, transformando a legenda automática em texto taquigráfico elegante, fluido e institucional, observando rigorosamente estas diretrizes:

1. PRESERVAÇÃO INTEGRAL DO CONTEÚDO E FIDELIDADE:
   - Não resuma, não omita debates, votos ou argumentos e não invente falas.
   - Trata-se de transcrição oficial saneada, não de resumo.

2. SUPRESSÃO DE PROGRAMAÇÃO PRÉ-SESSÃO E RUÍDOS DE ÁUDIO:
   - Se este trecho for do início da transmissão e contiver reportagens de TV, programas institucionais, entrevistas (como lançamentos de livros, cães-guia, Museu/Biblioteca, Rejúri) anteriores à abertura dos trabalhos pelo Presidente, SUPRIMA integralmente essa introdução e inicie no momento em que a sessão é aberta.
   - Elimine absolutamente ruídos de áudio anotados pela legenda (ex.: [música], [tosse], [palmas], [risos], [roncando], [suspiro]).
   - Elimine qualquer caractere residual de legenda `>>` ou `>>>`.
   - Elimine repetições ou gagueiras de áudio truncado (ex.: 'no agravo interno, no agravo interno...').

3. ATRIBUIÇÃO PRECISA DE INTERLOCUTOR EM CADA PARÁGRAFO:
   - Formato canônico obrigatório para cada intervenção:
     `**[HH:MM:SS] Orador:** Texto`
   - DESTAQUE NOMINAL EM NEGRITO para todas as intervenções do Min. Herman Benjamin:
     `**[HH:MM:SS] Min. Herman Benjamin:** Texto`
   - Para os demais oradores, identifique o cargo ou função institucional:
     - Presidente: `**[HH:MM:SS] Min. Presidente (Min. [Nome]):** Texto` ou `**[HH:MM:SS] Min. [Nome] (Presidente):** Texto`
     - Relatores/Vogais: `**[HH:MM:SS] Min. [Nome]:** Texto` (ou `Des. Conv. [Nome]`)
     - Advogados: `**[HH:MM:SS] Dr. [Nome] (Advogado):** Texto`
     - Ministério Público: `**[HH:MM:SS] Dr. [Nome] (Subprocurador-Geral da República):** Texto`
     - Secretária da Turma/Seção: `**[HH:MM:SS] Dra. [Nome] (Secretária):** Texto`
   - Quando houver apregoamento de novo processo, questão de ordem ou início de bloco temático relevante, insira um subtítulo:
     `### [HH:MM:SS] [Identificação do Processo / Questão de Ordem]`

4. CORREÇÃO GRAMATICAL E TERMINOLOGIA JURÍDICA:
   - Corrija erros fonéticos de ASR na grafia de nomes de Ministros, partes, advogados e processos:
     Min. Herman Benjamin, Min. Sérgio Kukina, Min. Gurgel de Faria, Min. Regina Helena Costa, Min. Paulo Sérgio Domingues, Min. Benedito Gonçalves, Min. Francisco Falcão, Min. Mauro Campbell Marques, Min. Teodoro Silva Santos, Min. Afrânio Vilela, Min. Maria Thereza de Assis Moura, Desembargadores Convocados.
   - Ajuste grafias de súmulas, leis e siglas (REsp, AREsp, AgInt, EDcl, IAC, CPC, CTN, Súmula 7/STJ, Tema 1220/STJ, Tema 1244/STJ, etc.).

5. PARÁGRAFOS ORATÓRIOS FLUIDOS:
   - Agrupe a fala em parágrafos coesos e oratórios, evitando a fragmentação linha a linha da legenda automática.

6. Devolva APENAS o texto revisado em Markdown, sem explicações preliminares ou finais e sem emojis.

TRECHO DA TRANSCRIÇÃO ({orgao} - {data} - Parte {parte}/{total_partes}):

{trecho}
"""


def _timestamp_para_segundos(ts: str) -> int:
    partes = [int(p) for p in ts.split(":")]
    if len(partes) == 3:
        return partes[0] * 3600 + partes[1] * 60 + partes[2]
    if len(partes) == 2:
        return partes[0] * 60 + partes[1]
    return 0


def aplicar_glossario_juridico(texto: str) -> str:
    """Corrige distorções fonéticas recorrentes nas legendas do YouTube."""
    resultado = texto
    for padrao, substituto in GLOSSARIO_FONETICO_STJ:
        resultado = padrao.sub(substituto, resultado)
    return re.sub(r" {2,}", " ", resultado).strip()


def _parsear_linhas_brutas(transcricao_bruta: str) -> list[tuple[str, int, str]]:
    """Extrai tuplas (timestamp_str, segundos, texto) da transcrição bruta."""
    itens: list[tuple[str, int, str]] = []
    for linha in (transcricao_bruta or "").splitlines():
        linha_limpa = linha.strip()
        if not linha_limpa:
            continue
        match = LINHA_TIMESTAMP_RE.match(linha_limpa)
        if match:
            ts_str, conteudo = match.group(1), match.group(2).strip()
            itens.append((ts_str, _timestamp_para_segundos(ts_str), conteudo))
        elif itens:
            ts_ant, seg_ant, txt_ant = itens[-1]
            itens[-1] = (ts_ant, seg_ant, f"{txt_ant} {linha_limpa}".strip())
    return itens


def _remover_vinhetas_iniciais(itens: list[tuple[str, int, str]]) -> list[tuple[str, int, str]]:
    """
    Remove blocos iniciais de programação institucional da TV STJ anteriores à abertura da sessão
    e filtra inserções comerciais conhecidas em intervalos.
    """
    if not itens:
        return []

    # 1. Procurar se há um marcador explícito de abertura nos primeiros 60 minutos
    indice_abertura = 0
    for idx, (_, segs, texto) in enumerate(itens):
        if segs > 60 * 60:
            break
        if PADROES_ABERTURA_SESSAO.search(texto):
            indice_abertura = idx
            break

    # 2. Se não encontrou frase canônica de abertura, verificar se há loop pré-sessão com [música]
    # nos primeiros 45 minutos (típico das transmissões do YouTube do STJ antes de abrir o microfone do plenário)
    if indice_abertura == 0:
        ult_musica_idx = -1
        contagem_musica = 0
        for idx, (_, segs, texto) in enumerate(itens):
            if segs > 45 * 60:
                break
            if "[música]" in texto.lower() or "[musica]" in texto.lower():
                contagem_musica += 1
                ult_musica_idx = idx
        if contagem_musica >= 5 and ult_musica_idx > 0 and ult_musica_idx + 1 < len(itens):
            indice_abertura = ult_musica_idx + 1

    recorte = itens[indice_abertura:] if indice_abertura > 0 else itens

    # Filtrar linhas que contenham frases explícitas de vinheta institucional
    filtrados = [
        item
        for item in recorte
        if not PADROES_VINHETA_INSTITUCIONAL.search(item[2])
    ]
    return filtrados if filtrados else recorte


def pre_sanear_transcricao(transcricao_bruta: str) -> str:
    """
    Converte a legenda bruta (fragmentada a cada 2-3 segundos) em uma transcrição
    saneada, sem vinhetas comerciais, com nomes dos Ministros corrigidos e agrupada
    em parágrafos legíveis com minutagem [HH:MM:SS].
    """
    itens = _parsear_linhas_brutas(transcricao_bruta)
    if not itens:
        return aplicar_glossario_juridico(transcricao_bruta or "")

    itens_limpos = _remover_vinhetas_iniciais(itens)

    paragrafos: list[str] = []
    ts_bloco_atual: str | None = None
    seg_bloco_inicio: int = 0
    frases_bloco: list[str] = []
    chars_bloco: int = 0

    def fechar_bloco() -> None:
        nonlocal ts_bloco_atual, seg_bloco_inicio, frases_bloco, chars_bloco
        if not frases_bloco or not ts_bloco_atual:
            return
        texto_unido = " ".join(frases_bloco)
        texto_unido = re.sub(r"\s+", " ", texto_unido).strip()
        texto_unido = aplicar_glossario_juridico(texto_unido)
        if not texto_unido:
            frases_bloco = []
            chars_bloco = 0
            return

        # Capitalizar início do parágrafo se começar com letra minúscula
        if texto_unido and texto_unido[0].isalpha() and texto_unido[0].islower():
            texto_unido = texto_unido[0].upper() + texto_unido[1:]

        # Destacar visualmente se o bloco contiver intervenção direta do Min. Herman Benjamin
        if re.search(r"\bMin\.\s+Herman\s+Benjamin\b", texto_unido):
            paragrafos.append(f"**[{ts_bloco_atual}]** {texto_unido}")
        else:
            paragrafos.append(f"[{ts_bloco_atual}] {texto_unido}")

        ts_bloco_atual = None
        frases_bloco = []
        chars_bloco = 0

    for ts_str, segs, texto in itens_limpos:
        mudanca_locutor = texto.startswith(">>") or bool(PADROES_NOVO_BLOCO.search(texto))
        texto_sem_seta = re.sub(r"^>>+\s*", "", texto).strip()
        if not texto_sem_seta:
            continue

        if ts_bloco_atual is None:
            ts_bloco_atual = ts_str
            seg_bloco_inicio = segs

        tempo_decorrido = segs - seg_bloco_inicio
        fim_de_frase = bool(frases_bloco and re.search(r"[.?!]$", frases_bloco[-1]))

        if frases_bloco and (
            mudanca_locutor
            or (tempo_decorrido >= 50 and fim_de_frase)
            or chars_bloco >= 520
        ):
            fechar_bloco()
            ts_bloco_atual = ts_str
            seg_bloco_inicio = segs

        frases_bloco.append(texto_sem_seta)
        chars_bloco += len(texto_sem_seta) + 1

    fechar_bloco()
    return "\n\n".join(paragrafos).strip()


def _dividir_em_chunks(texto: str, tamanho_max: int) -> list[str]:
    blocos = texto.split("\n\n")
    chunks: list[str] = []
    atual: list[str] = []
    chars = 0

    for bloco in blocos:
        if chars + len(bloco) + 2 > tamanho_max and atual:
            chunks.append("\n\n".join(atual))
            atual = []
            chars = 0
        atual.append(bloco)
        chars += len(bloco) + 2

    if atual:
        chunks.append("\n\n".join(atual))
    return chunks


def formatar_data_br(data_iso: str) -> str:
    if not data_iso or len(data_iso) != 10:
        return data_iso or "Data não informada"
    ano, mes, dia = data_iso.split("-")
    return f"{dia}/{mes}/{ano}"


def gerar_documento_transcricao_revisada(
    video: VideoInfo,
    corpo_revisado: str,
    modo_revisao: str = "Saneamento estrutural e revisão assistida",
) -> str:
    """Envolve o corpo da transcrição revisada com cabeçalho institucional padronizado."""
    orgao_nome = nome_orgao_canonico(video.orgao)
    data_br = formatar_data_br(video.upload_date)
    duracao_str = formatar_duracao(video.duration)

    return (
        f"# Transcrição Revisada e Saneada — {orgao_nome} ({data_br})\n\n"
        f"- **Órgão Julgador:** {orgao_nome} — Superior Tribunal de Justiça\n"
        f"- **Data da Sessão:** {data_br}\n"
        f"- **Duração da Transmissão:** {duracao_str}\n"
        f"- **Vídeo Original:** [{video.title}]({video.url})\n"
        f"- **Processamento:** {modo_revisao} (gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')})\n\n"
        f"---\n\n"
        f"## Transcrição Organizada por Minutagem\n\n"
        f"{corpo_revisado.strip()}\n"
    )


def sanear_e_revisar_transcricao(
    video: VideoInfo,
    transcricao_bruta: str,
    gemini_client: GeminiClient | None = None,
    usar_llm: bool = True,
    max_threads: int = DEFAULT_MAX_CHUNK_THREADS,
) -> str:
    """
    Executa o pipeline completo de saneamento da transcrição:
    1. Pré-saneamento determinístico (remoção de vinhetas, agrupamento por minutagem e glossário STJ).
    2. Revisão assistida por IA em segmentos (quando usar_llm=True e Gemini disponível),
       com fallback seguro por segmento para a versão pré-saneada.
    """
    base_saneada = pre_sanear_transcricao(transcricao_bruta)
    if not usar_llm or gemini_client is None or not gemini_client.disponivel:
        return gerar_documento_transcricao_revisada(
            video,
            base_saneada,
            modo_revisao="Saneamento determinístico e organização por minutagem",
        )

    chunks = _dividir_em_chunks(base_saneada, LIMITE_CARACTERES_SANEAMENTO_CHUNK)
    orgao_nome = nome_orgao_canonico(video.orgao)
    data_br = formatar_data_br(video.upload_date)

    logger.info(
        "Revisando transcrição de %s em %d segmento(s)...",
        video.video_id,
        len(chunks),
    )

    def revisar_chunk(item: tuple[int, str]) -> tuple[int, str]:
        idx, trecho = item
        prompt = PROMPT_REVISAO_TRANSCRICAO.format(
            orgao=orgao_nome,
            data=data_br,
            parte=idx,
            total_partes=len(chunks),
            trecho=trecho,
        )
        ok, revisado, erro = gemini_client.gerar_conteudo(prompt, tier="flash")
        if ok and revisado and len(revisado) >= len(trecho) * 0.45:
            return idx, revisado.strip()
        logger.warning(
            "Segmento %d/%d da transcrição mantido no formato pré-saneado (%s).",
            idx,
            len(chunks),
            erro or "resposta curta",
        )
        return idx, trecho

    workers = max(1, min(max_threads, len(chunks)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        resultados = list(executor.map(revisar_chunk, enumerate(chunks, 1)))

    resultados.sort(key=lambda r: r[0])
    corpo_final = "\n\n".join(r[1] for r in resultados).strip()

    # Pós-processamento determinístico de segurança contra resíduos de legenda
    corpo_final = re.sub(r"^>>+\s*", "", corpo_final, flags=re.MULTILINE)
    corpo_final = re.sub(r">>+\s*", "", corpo_final)
    corpo_final = re.sub(
        r"\[(?:m[uú]sica|risos|palmas|aplausos|tosse|roncando|suspiro|inaud[ií]vel)\]",
        "",
        corpo_final,
        flags=re.IGNORECASE,
    )
    corpo_final = re.sub(r"[ \t]+", " ", corpo_final)

    return gerar_documento_transcricao_revisada(
        video,
        corpo_final,
        modo_revisao="Saneamento estrutural e revisão textual assistida",
    )
