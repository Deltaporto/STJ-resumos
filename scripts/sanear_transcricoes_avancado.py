"""Script de saneamento taquigráfico avançado para transcrições do STJ.
Corta cirurgicamente blocos de vinhetas/noticiários pré-sessão,
corrige erros fonéticos e numéricos de ASR, identifica oradores
e organiza em parágrafos taquigráficos fluidos.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_OUTPUT = REPO_ROOT / "data" / "output"
WEB_TRANSCRICOES = REPO_ROOT / "web" / "transcricoes"

# Dicionário de correções fonéticas e numéricas para ASR do STJ
CORRECOES_FONETICAS = [
    # Ministros e Autoridades
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Gurj[aã]o\s+de\s+Faria\b", re.IGNORECASE), "Min. Gurgel de Faria"),
    (re.compile(r"\bGurj[aã]o\s+de\s+Faria\b", re.IGNORECASE), "Gurgel de Faria"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Marco\s+Ar[eé]lio\s+Beli[sz]{1,2}\b", re.IGNORECASE), "Min. Marco Aurélio Bellizze"),
    (re.compile(r"\bMarco\s+Ar[eé]lio\s+Beli[sz]{1,2}\b", re.IGNORECASE), "Marco Aurélio Bellizze"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+S[eé]rgico\s+Quina\b", re.IGNORECASE), "Min. Sérgio Kukina"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+S[eé]rgio\s+(?:Cuquina|Cucina|Coquina|Quina)\b", re.IGNORECASE), "Min. Sérgio Kukina"),
    (re.compile(r"\b(?:senhora\s+ministra|ministra|min\.)\s+Maria\s+Teresa\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Afran\s+Vilela\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Afr[aâ]nio\s+Vilela\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Herman\s+Benjamin\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\b(?:senhora\s+ministra|ministra|min\.)\s+Regina\s+Helena\s+Costa\b", re.IGNORECASE), "Min. Regina Helena Costa"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Paulo\s+S[eé]rgio\s+Domingues\b", re.IGNORECASE), "Min. Paulo Sérgio Domingues"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Teodoro\s+Silva\s+Santos\b", re.IGNORECASE), "Min. Teodoro Silva Santos"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Benedito\s+Gon[cç]alves\b", re.IGNORECASE), "Min. Benedito Gonçalves"),
    (re.compile(r"\b(?:senhor\s+ministro|ministro|min\.)\s+Francisco\s+Falc[aã]o\b", re.IGNORECASE), "Min. Francisco Falcão"),
    (re.compile(r"\bdoutora\s+Andrea\s+Fujishima\b", re.IGNORECASE), "Dra. Andrea Gonçalves Fujishima"),

    # Institutos e Órgãos
    (re.compile(r"\bDISBEN\s+IPFN\s+ISS\b", re.IGNORECASE), "DIRBEN/PFE/INSS"),
    (re.compile(r"\bDisben\b", re.IGNORECASE), "DIRBEN"),
    (re.compile(r"\bprescional\b", re.IGNORECASE), "prescricional"),
    (re.compile(r"\b[oó]pici?e?s?\b", re.IGNORECASE), "óbice"),
    (re.compile(r"\b[oó]pices\b", re.IGNORECASE), "óbices"),
    (re.compile(r"\befem[eé]rid[aá]rio\b", re.IGNORECASE), "efeméride (aniversário)"),
    (re.compile(r"\bvotos?\s+vistos?\b", re.IGNORECASE), "votos-vista"),
    (re.compile(r"\bvotos?\s+vistas?\b", re.IGNORECASE), "votos-vista"),
    (re.compile(r"\bprimeira\s+sess[aã]o\b", re.IGNORECASE), "Primeira Seção"),
    (re.compile(r"\bprimeira\s+turma\b", re.IGNORECASE), "Primeira Turma"),
    (re.compile(r"\bs[uú]mula\s+sete\b", re.IGNORECASE), "Súmula 7/STJ"),
    (re.compile(r"\bs[uú]mula\s+oitenta\s+e\s+tr[eê]s\b", re.IGNORECASE), "Súmula 83/STJ"),
    (re.compile(r"\bs[uú]mula\s+duzentos\s+e\s+onze\b", re.IGNORECASE), "Súmula 211/STJ"),

    # Correções de Numeração de Processos e Temas Distorcidos pelo ASR
    (re.compile(r"\b2\.53\.569\b"), "REsp 2.053.569"),
    (re.compile(r"\b2\.53\.647\b"), "REsp 2.053.647"),
    (re.compile(r"\b2\.46\.893\s*93\b"), "REsp 2.046.893"),
    (re.compile(r"\b2\.34\.824\b"), "REsp 2.134.824"),
    (re.compile(r"\b2\.170\.82\b"), "REsp 2.170.082"),
    (re.compile(r"\b2\.170\.92\b"), "REsp 2.170.092"),
    (re.compile(r"\b2\.148\.056\s*1056\b"), "REsp 2.148.056"),
    (re.compile(r"\b2\.093\.000\.\s*860\b"), "REsp 2.093.860"),
    (re.compile(r"\btema\s+1244\b", re.IGNORECASE), "Tema 1244/STJ"),
    (re.compile(r"\btema\s+1302\b", re.IGNORECASE), "Tema 1302/STJ"),
    (re.compile(r"\btema\s+1275\b", re.IGNORECASE), "Tema 1275/STJ"),
    (re.compile(r"\btema\s+13,?97\b", re.IGNORECASE), "Tema 1397/STJ"),
    (re.compile(r"\btema\s+1220\b", re.IGNORECASE), "Tema 1220/STJ"),
    (re.compile(r"\btema\s+1324\b", re.IGNORECASE), "Tema 1324/STJ"),
    (re.compile(r"\btema\s+1379\b", re.IGNORECASE), "Tema 1379/STJ"),
    (re.compile(r"\btema\s+1432\b", re.IGNORECASE), "Tema 1432/STJ"),
    (re.compile(r"\bIAC\s+21\b", re.IGNORECASE), "IAC 21/STJ"),

    # Deduplicação de Gagueira / Repetições de ASR
    (re.compile(r"(?:,\s*no\s+agravo\s+interno){2,}", re.IGNORECASE), ""),
    (re.compile(r"(?:,\s*no\s+agravo\s+em\s+recurso\s+especial){2,}", re.IGNORECASE), ""),
    (re.compile(r"\b([a-zA-Záéíóúçãõ]+)\s+\1\b", re.IGNORECASE), r"\1"),
]

# Detecção de Oradores da 1ª Turma e 1ª Seção
RE_ORADORES = [
    (re.compile(r"\b(?:recolho\s+o\s+voto\s+do\s+ministro\s+herman|passo\s+a\s+palavra\s+ao\s+ministro\s+herman|com\s+a\s+palavra\s+o\s+ministro\s+herman|ministro\s+herman\b.*\bboa\s+tarde)\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\b(?:com\s+a\s+palavra\s+a\s+ministra\s+regina|ministra\s+regina\s+helena\b.*\bsenhor\s+presidente)\b", re.IGNORECASE), "Min. Regina Helena Costa"),
    (re.compile(r"\b(?:passo\s+a\s+palavra\s+ao\s+ministro\s+teodoro|ministro\s+teodoro\b.*\bvou\s+ler\s+a\s+ementa)\b", re.IGNORECASE), "Min. Teodoro Silva Santos (Relator)"),
    (re.compile(r"\b(?:com\s+a\s+palavra\s+a\s+ministra\s+maria\s+thereza|ministra\s+maria\s+thereza\b.*\beu\s+achei\s+muito\s+relevantes)\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\b(?:votando\s+ent[aã]o\s+o\s+ministro\s+afr[aâ]nio|ministro\s+afr[aâ]nio\b.*\bestou\s+acompanhando)\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\b(?:passo\s+a\s+palavra\s+ao\s+ministro\s+paulo\s+s[eé]rgio|ministro\s+paulo\s+s[eé]rgio\b.*\bsenhor\s+presidente)\b", re.IGNORECASE), "Min. Paulo Sérgio Domingues"),
    (re.compile(r"\b(?:solicito\s+[aà]\s+senhora\s+secret[aá]ria|ata\s+de\s+julgamento,\s+primeira\s+turma)\b", re.IGNORECASE), "Dra. Andrea Fujishima (Secretária da Sessão)"),
    (re.compile(r"\b(?:declaro\s+abertos?\s+os?\s+trabalhos?|bem,\s+eh,\s+pergunto,\s+temos\s+apenas\s+dois\s+processos|vamos\s+agora\s+eh\s+para\s+um\s+destaque\s+da\s+presid[eê]ncia)\b", re.IGNORECASE), "Presidente da Sessão"),
]


def aplicar_correcoes(texto: str) -> str:
    res = texto
    for padrao, sub in CORRECOES_FONETICAS:
        res = padrao.sub(sub, res)
    # Limpar espaços duplos
    res = re.sub(r"[ \t]+", " ", res).strip()
    return res


def sanear_linhas_sessao(
    linhas_brutas: list[str],
    timestamp_inicio_real: str,
    nome_orgao: str,
    data_sessao: str,
    video_url: str,
    duracao: str,
) -> str:
    """
    Filtra rigorosamente para manter apenas do timestamp de início real para frente,
    aplica correções fonéticas/institucionais e agrupa em blocos oratórios com identificação
    de interlocutor e minutagem limpa.
    """
    inicio_encontrado = False
    blocos: list[tuple[str, str, str]] = []  # (ts, orador_ou_fase, texto)

    orador_atual = "Presidência / Colegiado"
    ts_bloco = timestamp_inicio_real
    frases_bloco: list[str] = []

    re_linha = re.compile(r"^\[(\d{2}:\d{2}:\d{2})\]\s*(.+)$")

    for linha in linhas_brutas:
        m = re_linha.match(linha.strip())
        if not m:
            continue
        ts, txt = m.group(1), m.group(2).strip()

        if not inicio_encontrado:
            if ts >= timestamp_inicio_real:
                inicio_encontrado = True
            else:
                continue

        # Identificar se há mudança de orador
        novo_orador = None
        for re_o, nome_o in RE_ORADORES:
            if re_o.search(txt):
                novo_orador = nome_o
                break

        # Fechar bloco se mudou de orador ou atingiu tamanho substancial
        if novo_orador and novo_orador != orador_atual and frases_bloco:
            texto_unido = aplicar_correcoes(" ".join(frases_bloco))
            blocos.append((ts_bloco, orador_atual, texto_unido))
            orador_atual = novo_orador
            ts_bloco = ts
            frases_bloco = [txt]
        elif len(" ".join(frases_bloco)) > 450 and txt.endswith((".", "!", "?")):
            frases_bloco.append(txt)
            texto_unido = aplicar_correcoes(" ".join(frases_bloco))
            blocos.append((ts_bloco, orador_atual, texto_unido))
            ts_bloco = ts
            frases_bloco = []
        else:
            frases_bloco.append(txt)

    if frases_bloco:
        texto_unido = aplicar_correcoes(" ".join(frases_bloco))
        blocos.append((ts_bloco, orador_atual, texto_unido))

    # Formatar Markdown final limpo
    md_linhas = [
        f"# Transcrição Revisada e Saneada — {nome_orgao} ({data_sessao})",
        "",
        f"- **Órgão Julgador:** {nome_orgao} — Superior Tribunal de Justiça",
        f"- **Data da Sessão:** {data_sessao}",
        f"- **Duração da Transmissão:** {duracao}",
        f"- **Vídeo Original:** [{nome_orgao} - STJ - {data_sessao}]({video_url})",
        f"- **Saneamento Taquigráfico:** Eliminação integral de vinhetas pré-sessão, correção fonética de nomes/acórdãos e estruturação por interlocutor",
        "",
        "---",
        "",
        "## Transcrição Organizada por Interlocutor e Minutagem",
        "",
    ]

    for ts, orador, texto in blocos:
        if not texto:
            continue
        # Destaque especial ao Min. Herman Benjamin
        is_herman = "Herman Benjamin" in orador or "Min. Herman Benjamin" in texto
        if is_herman:
            md_linhas.append(f"**[{ts}] Min. Herman Benjamin:** {texto}")
        else:
            md_linhas.append(f"**[{ts}] {orador}:** {texto}")
        md_linhas.append("")

    return "\n".join(md_linhas)


def processar_primeira_secao():
    arq_bruto = DATA_OUTPUT / "primeira_secao" / "2026-10-14_primeira_secao_59Xi4wO9VVs_transcricao_bruta.md"
    if not arq_bruto.exists():
        print(f"Arquivo não encontrado: {arq_bruto}")
        return

    linhas = arq_bruto.read_text(encoding="utf-8").splitlines()
    # O início real da sessão ocorre às 00:23:09 com os anúncios da pauta e adiamentos
    saneado = sanear_linhas_sessao(
        linhas_brutas=linhas,
        timestamp_inicio_real="00:23:09",
        nome_orgao="Primeira Seção",
        data_sessao="14/10/2026",
        video_url="https://www.youtube.com/watch?v=59Xi4wO9VVs",
        duracao="4h 47min",
    )

    saida_output = DATA_OUTPUT / "primeira_secao" / "2026-10-14_primeira_secao_59Xi4wO9VVs_transcricao_revisada.md"
    saida_output.write_text(saneado, encoding="utf-8")
    print(f"[OK] Primeira Seção saneada: {saida_output} ({len(saneado)} bytes)")

    WEB_TRANSCRICOES.mkdir(parents=True, exist_ok=True)
    saida_web = WEB_TRANSCRICOES / "2026-10-14_primeira_secao_transcricao_revisada.md"
    saida_web.write_text(saneado, encoding="utf-8")
    print(f"[OK] Copiado para web: {saida_web}")


def processar_primeira_turma():
    arq_bruto = DATA_OUTPUT / "primeira_turma" / "2026-10-13_primeira_turma_Ikn2-1h60JU_transcricao_bruta.md"
    if not arq_bruto.exists():
        print(f"Arquivo não encontrado: {arq_bruto}")
        return

    linhas = arq_bruto.read_text(encoding="utf-8").splitlines()
    # O início real da sessão ocorre às 00:29:09 com a abertura solene pelo Presidente Min. Sérgio Kukina
    saneado = sanear_linhas_sessao(
        linhas_brutas=linhas,
        timestamp_inicio_real="00:29:09",
        nome_orgao="Primeira Turma",
        data_sessao="13/10/2026",
        video_url="https://www.youtube.com/watch?v=Ikn2-1h60JU",
        duracao="4h 46min",
    )

    saida_output = DATA_OUTPUT / "primeira_turma" / "2026-10-13_primeira_turma_Ikn2-1h60JU_transcricao_revisada.md"
    saida_output.write_text(saneado, encoding="utf-8")
    print(f"[OK] Primeira Turma saneada: {saida_output} ({len(saneado)} bytes)")

    WEB_TRANSCRICOES.mkdir(parents=True, exist_ok=True)
    saida_web = WEB_TRANSCRICOES / "2026-10-13_primeira_turma_transcricao_revisada.md"
    saida_web.write_text(saneado, encoding="utf-8")
    print(f"[OK] Copiado para web: {saida_web}")


if __name__ == "__main__":
    processar_primeira_secao()
    processar_primeira_turma()
