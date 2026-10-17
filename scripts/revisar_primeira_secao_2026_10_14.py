"""Script definitivo e ultra-preciso de saneamento e revisão taquigráfica da Primeira Seção do STJ (14/10/2026).
Processa as legendas brutas da sessão (a partir de 00:23:09), eliminando ruídos pré-sessão,
corrigindo erros fonéticos de ASR e atribuindo com exatidão cada interlocutor.
Destaca nominalmente todas as manifestações do Min. Herman Benjamin.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(r"C:\Users\Casa\Documents\STJ-Sessoes-GMHB")
FILE_RAW = REPO_ROOT / "data" / "output" / "primeira_secao" / "2026-10-14_primeira_secao_59Xi4wO9VVs_transcricao_bruta.md"
FILE_DEST_DATA = REPO_ROOT / "data" / "output" / "primeira_secao" / "2026-10-14_primeira_secao_59Xi4wO9VVs_transcricao_revisada.md"
FILE_DEST_WEB = REPO_ROOT / "web" / "transcricoes" / "2026-10-14_primeira_secao_transcricao_revisada.md"

CORRECOES_TEXTUAIS = [
    # Nomes de ministros e autoridades
    (re.compile(r"\bministro\s+Gurj[aã]o\s+de\s+Faria\b", re.IGNORECASE), "Min. Gurgel de Faria"),
    (re.compile(r"\bministro\s+Gurgel\s+Farias?\b", re.IGNORECASE), "Min. Gurgel de Faria"),
    (re.compile(r"\bministro\s+Gugel\b", re.IGNORECASE), "Min. Gurgel de Faria"),
    (re.compile(r"\bministro\s+Guj\b", re.IGNORECASE), "Min. Gurgel de Faria"),
    (re.compile(r"\bministro\s+Marco\s+Ar[eé]lio\s+Beli[sz]{1,2}\b", re.IGNORECASE), "Min. Marco Aurélio Bellizze"),
    (re.compile(r"\bministro\s+Mel[ií]\b", re.IGNORECASE), "Min. Marco Aurélio Bellizze"),
    (re.compile(r"\bministro\s+Belize\b", re.IGNORECASE), "Min. Marco Aurélio Bellizze"),
    (re.compile(r"\bministro\s+S[eé]rgico\s+Quina\b", re.IGNORECASE), "Min. Sérgio Kukina"),
    (re.compile(r"\bministro\s+S[eé]rgio\s+(?:Cuquina|Cucina|Coquina|Quina)\b", re.IGNORECASE), "Min. Sérgio Kukina"),
    (re.compile(r"\bministro\s+Cuquina\b", re.IGNORECASE), "Min. Sérgio Kukina"),
    (re.compile(r"\bministra\s+Maria\s+Teresa\s+de\s+Assismour\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\bministro\s+Maria\s+Teresa\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\bministra\s+Maria\s+Teresa\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\bmis\s+Maria\s+Teresa\b", re.IGNORECASE), "Min. Maria Thereza de Assis Moura"),
    (re.compile(r"\bministro\s+Afr[aã]o\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\bministro\s+Afran\s+Vilela\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\bministra\s+Fr[aâ]nia\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\bministra\s+Fran\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\bministro\s+Afr[oô]nio\b", re.IGNORECASE), "Min. Afrânio Vilela"),
    (re.compile(r"\bministro\s+Herma\s+Benjamin\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\bministro\s+Herma\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\bministro\s+Resma\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\bministro\s+Rema\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\bministro\s+R\b", re.IGNORECASE), "Min. Herman Benjamin"),
    (re.compile(r"\bministro\s+Paulo\s+S[eé]rgio\s+Dominguez\b", re.IGNORECASE), "Min. Paulo Sérgio Domingues"),
    (re.compile(r"\bministro\s+Teodoro\b", re.IGNORECASE), "Min. Teodoro Silva Santos"),
    (re.compile(r"\bministra\s+A\s+Susete\b", re.IGNORECASE), "Min. Assusete Magalhães"),
    (re.compile(r"\bministra\s+Susete\b", re.IGNORECASE), "Min. Assusete Magalhães"),
    (re.compile(r"\bministro\s+Teori\s+Zavasque\b", re.IGNORECASE), "Min. Teori Zavascki"),
    (re.compile(r"\bministro\s+Benedito\b", re.IGNORECASE), "Min. Benedito Gonçalves"),
    (re.compile(r"\bministro\s+Jo[aã]o\s+Ot[aá]vio\s+Noronha\b", re.IGNORECASE), "Min. João Otávio de Noronha"),
    (re.compile(r"\bF[aá]bio\s+Moner[aá]\b", re.IGNORECASE), "Fábio Monnerat"),
    (re.compile(r"\bDr\.\s+F[aá]bio\s+Moneral\b", re.IGNORECASE), "Dr. Fábio Monnerat"),
    (re.compile(r"\bStephan\s+Guimar[aã]es\s+Emerrim\b", re.IGNORECASE), "Stephan Guimarães Emerim"),
    (re.compile(r"\bDr\.\s+Stepan\b", re.IGNORECASE), "Dr. Stephan"),
    (re.compile(r"\bDr\.\s+Stefan\b", re.IGNORECASE), "Dr. Stephan"),
    (re.compile(r"\bDr\.\s+Itel\b", re.IGNORECASE), "Dr. Eitel Santiago"),
    (re.compile(r"\bministr[ao]\s+Fr[aáâã]nio\b", re.IGNORECASE), "Min. Afrânio Vilela"),

    # Institutos, órgãos e termos jurídicos
    (re.compile(r"\bDISBEN\s+IPFN\s+ISS\b", re.IGNORECASE), "DIRBEN/PFE/INSS"),
    (re.compile(r"\bDISBEN\b", re.IGNORECASE), "DIRBEN"),
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
    (re.compile(r"\bs[uú]mula\s+oitenta\s+e\s+tr[eé]s\b", re.IGNORECASE), "Súmula 83/STJ"),
    (re.compile(r"\bs[uú]mula\s+duzentos\s+e\s+onze\b", re.IGNORECASE), "Súmula 211/STJ"),
    (re.compile(r"\bs[uú]mula\s+585\b", re.IGNORECASE), "Súmula 585/STJ"),
    (re.compile(r"\bs[uú]mula\s+vinculante\s+51\b", re.IGNORECASE), "Súmula Vinculante 51/STF"),
    (re.compile(r"\bcustos\s+leges\b", re.IGNORECASE), "custos legis"),
    (re.compile(r"\bamigoscur\b", re.IGNORECASE), "amicus curiae"),
    (re.compile(r"\bamigocur\b", re.IGNORECASE), "amicus curiae"),
    (re.compile(r"\bAmit\s+CUR\b", re.IGNORECASE), "amicus curiae"),
    (re.compile(r"\bpupu\s+de\s+normas\b", re.IGNORECASE), "pot-pourri de normas"),
    (re.compile(r"\bapoamento\b", re.IGNORECASE), "apossamento"),
    (re.compile(r"\bplezali\b", re.IGNORECASE), "plus-valia"),
    (re.compile(r"\bRenavan\b", re.IGNORECASE), "Renavam"),
    (re.compile(r"\bpisicofins\b", re.IGNORECASE), "PIS/COFINS"),
    (re.compile(r"\bpiso\s+da\s+Cofins\b", re.IGNORECASE), "PIS e da COFINS"),
    (re.compile(r"\bGaet,\s*o\s*Gaetes\b", re.IGNORECASE), "GAETS"),
    (re.compile(r"\bGaetes\b", re.IGNORECASE), "GAETS"),
    (re.compile(r"\bGaet\b", re.IGNORECASE), "GAETS"),
    (re.compile(r"\bFen[aá]c\b", re.IGNORECASE), "FENASPS"),
    (re.compile(r"\bSind\s*Fisco\b", re.IGNORECASE), "SINDIFISCO"),
    (re.compile(r"\bBrasca\b", re.IGNORECASE), "ABRASCA"),
    (re.compile(r"\blid\b", re.IGNORECASE), "lide"),
    (re.compile(r"\binadente\b", re.IGNORECASE), "inadimplente"),
    (re.compile(r"\bmétodo\s+subtreto\b", re.IGNORECASE), "método subtrativo"),
    (re.compile(r"\bHi\s+gente\s+t[aá]\s+tratando\b", re.IGNORECASE), "Aqui a gente está tratando"),
    (re.compile(r"\bBS\s+variante\b", re.IGNORECASE), "IBS e suas variantes"),

    # Correções de números de processos e temas repetitivos
    (re.compile(r"\b2\.53\.569\b"), "REsp 2.053.569"),
    (re.compile(r"\b2\.53\.647\b"), "REsp 2.053.647"),
    (re.compile(r"\b2\.46\.893\s*93\b"), "REsp 2.046.893"),
    (re.compile(r"\bREsp\s+2\.046\.893\s+93\b"), "REsp 2.046.893"),
    (re.compile(r"\b2\.34\.824\b"), "REsp 2.134.824"),
    (re.compile(r"\b2\.170\.82\b"), "REsp 2.170.082"),
    (re.compile(r"\b2\.170\.92\b"), "REsp 2.170.092"),
    (re.compile(r"\b2\.148\.056\s*1056\b"), "REsp 2.148.056"),
    (re.compile(r"\b2\.093\.000\.\s*860\b"), "REsp 2.093.860"),
    (re.compile(r"\b2\.70\.059\b"), "REsp 2.070.059"),
    (re.compile(r"\b2\.199631\b"), "REsp 2.199.631"),
    (re.compile(r"\b826\.796,\s*796\b"), "REsp 1.826.796"),
    (re.compile(r"\brecurso\s+especial\s+826\.796\b", re.IGNORECASE), "REsp 1.826.796"),
    (re.compile(r"\b2213084\b"), "REsp 2.213.084"),
    (re.compile(r"\b2\s*227232\b"), "REsp 2.227.232"),
    (re.compile(r"\b2\.23885\b"), "REsp 2.238.885"),
    (re.compile(r"\b2\.2\.\s*238\s*889\b"), "REsp 2.238.889"),
    (re.compile(r"\brecurso\s+especial\s+093\b", re.IGNORECASE), "REsp 1.809.093"),
    (re.compile(r"\b1809\s*093\b"), "REsp 1.809.093"),
    (re.compile(r"\b1814\s*350\b"), "REsp 1.814.350"),
    (re.compile(r"\b1950\s*981\b"), "REsp 1.950.981"),
    (re.compile(r"\b2\s*004109\b"), "REsp 2.004.109"),
    (re.compile(r"\b2\.146\.834\b"), "REsp 2.146.834"),
    (re.compile(r"\b2\.146\.839\b"), "REsp 2.146.839"),
    (re.compile(r"\b2\.186\.838\b"), "REsp 2.186.838"),
    (re.compile(r"\b1\.793915\b"), "REsp 1.793.915"),
    (re.compile(r"\b1\.997\.816\s*16\b"), "REsp 1.997.816"),
    (re.compile(r"\b2\.152197\b"), "REsp 2.152.197"),
    (re.compile(r"\b2\.15097\b"), "REsp 2.150.097"),
    (re.compile(r"\b2\.15116\b"), "REsp 2.151.146"),
    (re.compile(r"\b2\.23924\b"), "REsp 2.239.204"),
    (re.compile(r"\b2\.239250\b"), "REsp 2.239.250"),
    (re.compile(r"\b2250737\b"), "REsp 2.250.737"),
    (re.compile(r"\b223488\b"), "REsp 2.234.888"),
    (re.compile(r"\b274050\b"), "REsp 2.174.050"),
    (re.compile(r"\b1909093\b"), "REsp 1.809.093"),
    (re.compile(r"\b004109\b"), "REsp 2.004.109"),

    # Temas repetitivos com padronização /STJ
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1244\b", re.IGNORECASE), "Tema 1244/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1302\b", re.IGNORECASE), "Tema 1302/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1275\b", re.IGNORECASE), "Tema 1275/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?13,?97\b", re.IGNORECASE), "Tema 1397/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1220(?:\s+STJ)?\b", re.IGNORECASE), "Tema 1220/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1226\b", re.IGNORECASE), "Tema 1226/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1324\b", re.IGNORECASE), "Tema 1324/STJ"),
    (re.compile(r"\b(?:tema|de\s+número)\s+1379\b", re.IGNORECASE), "Tema 1379/STJ"),
    (re.compile(r"\btema\s+eh\s+1379\b", re.IGNORECASE), "Tema 1379/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1386\b", re.IGNORECASE), "Tema 1386/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1364\b", re.IGNORECASE), "Tema 1364/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1454(?:is)?\b", re.IGNORECASE), "Tema 1454/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1432\b", re.IGNORECASE), "Tema 1432/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1433\b", re.IGNORECASE), "Tema 1433/STJ"),
    (re.compile(r"\btema\s+(?:n[úu]mero\s+)?1415\b", re.IGNORECASE), "Tema 1415/STJ"),
    (re.compile(r"\bIAC\s+21\b", re.IGNORECASE), "IAC 21/STJ"),

    # Remoção de duplicidades tipo /STJ/STJ ou Tema 1220/STJ STJ
    (re.compile(r"/STJ(?:/STJ)+", re.IGNORECASE), "/STJ"),
    (re.compile(r"Tema\s+(\d+)/STJ\s+STJ", re.IGNORECASE), r"Tema \1/STJ"),

    # Remoção de ruídos de ASR espúrios
    (re.compile(r"\[roncando\]", re.IGNORECASE), ""),
    (re.compile(r"\[suspirando\]", re.IGNORECASE), ""),
    (re.compile(r"\[limpando a garganta\]", re.IGNORECASE), ""),
    (re.compile(r"\[m[úu]sica\]", re.IGNORECASE), ""),
    (re.compile(r"\[tosse\]", re.IGNORECASE), ""),

    # Deduplicação fonética de palavras imediatas
    (re.compile(r"\b(ao|na|no|de|em|que|não|para|com|por|se|da|do|as|os|um|uma)\s+\1\b", re.IGNORECASE), r"\1"),
]


def limpar_texto(texto: str) -> str:
    """Aplica substituições de saneamento fonético, processual e institucional."""
    res = texto
    for padrao, sub in CORRECOES_TEXTUAIS:
        res = padrao.sub(sub, res)
    res = res.replace(">>", " ")
    res = re.sub(r"[ \t]+", " ", res)
    res = re.sub(r"\s+([,.;?!])", r"\1", res)
    res = re.sub(r"([,.;?!])([A-Za-zÀ-ÿ])", r"\1 \2", res)
    res = re.sub(r"\bREsp\s+REsp\b", "REsp", res)
    res = re.sub(r"/STJ(?:/STJ)+", "/STJ", res)
    res = re.sub(r"Tema\s+(\d+)/STJ\s+STJ", r"Tema \1/STJ", res)
    return res.strip()


def extrair_falas_brutas() -> list[tuple[str, str]]:
    with open(FILE_RAW, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Linha 487 é onde começa a sessão com o anúncio pelo Presidente em [00:23:09]
    session_lines = lines[487:]
    dialogues: list[tuple[str, str]] = []
    cur_ts = "00:23:09"
    cur_tokens: list[str] = []

    for l in session_lines:
        m = re.match(r"\[(\d{2}:\d{2}:\d{2})\]\s*(.*)", l.strip())
        if not m:
            continue
        ts, txt = m.group(1), m.group(2)
        parts = txt.split(">>")
        for i, p in enumerate(parts):
            p_clean = p.strip()
            if i > 0:
                if cur_tokens:
                    dialogues.append((cur_ts, " ".join(cur_tokens)))
                cur_ts = ts
                cur_tokens = []
            if p_clean:
                cur_tokens.append(p_clean)

    if cur_tokens:
        dialogues.append((cur_ts, " ".join(cur_tokens)))

    return dialogues


def mapear_e_desmembrar_falas(dialogues: list[tuple[str, str]]) -> list[tuple[str, str, str]]:
    """Mapeia os interlocutores exatos e faz desmembramentos onde houve continuidade de microfone."""
    itens: list[tuple[str, str, str]] = []

    for idx, (ts, text) in enumerate(dialogues):
        # ----------------------------------------------------
        # SEÇÃO 1: Abertura e QO Tema 1220/STJ (turnos 0 a 54)
        # ----------------------------------------------------
        if idx in (0, 1, 2):
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 3 <= idx <= 5:
            itens.append((ts, "Min. Teodoro Silva Santos (Relator)", text))
        elif idx == 6:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 7:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 8:
            itens.append((ts, "Min. Afrânio Vilela", text))
        elif idx == 9:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx in (10, 11):
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 12:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 13:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 14:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 15:
            itens.append((ts, "Min. Gurgel de Faria", text))
        elif idx == 16:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif 17 <= idx <= 19:
            itens.append((ts, "Min. Teodoro Silva Santos (Relator)", text))
        elif idx == 20:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 21:
            itens.append((ts, "Min. Gurgel de Faria", text))
        elif idx == 22:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif 23 <= idx <= 24:
            itens.append((ts, "Min. Gurgel de Faria", text))
        elif idx == 25:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 26:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 27:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx in (28, 29):
            # Turno 28 é aparte do Min. Gurgel de Faria ("Ministro Teodoro, mas só uma observação...")
            itens.append((ts, "Min. Gurgel de Faria", text))
        elif idx == 30:
            itens.append((ts, "Min. Teodoro Silva Santos (Relator)", text))
        elif idx == 31:
            itens.append((ts, "Min. Gurgel de Faria", text))
        elif idx == 32:
            itens.append((ts, "Min. Teodoro Silva Santos (Relator)", text))
        elif idx == 33:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 34:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 35 <= idx <= 36:
            itens.append((ts, "Min. Teodoro Silva Santos (Relator)", text))
        elif idx == 37:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 38:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 39:
            itens.append((ts, "Min. Marco Aurélio Bellizze", text))
        elif idx == 40:
            itens.append((ts, "Min. Afrânio Vilela", text))
        elif idx == 41:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 42 <= idx <= 43:
            itens.append((ts, "Min. Marco Aurélio Bellizze", text))
        elif idx == 44:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 45:
            itens.append((ts, "Min. Sérgio Kukina", text))
        elif idx == 46:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 47:
            itens.append((ts, "Min. Regina Helena Costa", text))
        elif idx == 48:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 49:
            itens.append((ts, "Min. Regina Helena Costa", text))
        elif idx == 50:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 51:
            itens.append((ts, "Min. Paulo Sérgio Domingues", text))
        elif idx == 52:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 53:
            itens.append((ts, "Min. Afrânio Vilela", text))
        elif idx == 54:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

        # ----------------------------------------------------
        # SEÇÃO 2: Tema 1379/STJ - Stock Options (turnos 55 a 72)
        # ----------------------------------------------------
        elif 55 <= idx <= 61:
            itens.append((ts, "Dra. Raquel Godói de Miranda Araújo (Procuradora da Fazenda Nacional)", text))
        elif idx == 62:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 63:
            itens.append((ts, "Min. Sérgio Kukina (Relator)", text))
        elif idx == 64:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 65:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 66:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 67:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 68:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 69:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 70:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 71:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 72:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

        # ----------------------------------------------------
        # SEÇÃO 3: Tema 1324/STJ - CTB art. 134 (turnos 73 a 94)
        # ----------------------------------------------------
        elif idx in (73, 74, 75):
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 76:
            itens.append((ts, "Dr. Carlos Eduardo Vieira (Defensoria Pública / GAETS)", text))
        elif idx == 77:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 78 <= idx <= 79:
            itens.append((ts, "Min. Paulo Sérgio Domingues (Relator)", text))
        elif idx == 80:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 81 <= idx <= 85:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 86:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 87:
            itens.append((ts, "Dra. Camila Gambarra Moreira (Procuradora Federal / ANTT)", text))
        elif idx == 88:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 89:
            itens.append((ts, "Dr. Paulo Martins dos Santos (Procurador do Estado do Ceará)", text))
        elif 90 <= idx <= 93:
            itens.append((ts, "Min. Paulo Sérgio Domingues (Relator)", text))
        elif idx == 94:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

        # ----------------------------------------------------
        # SEÇÃO 4: Tema 1433/STJ - 28,86% MS (turnos 95 a 112)
        # ----------------------------------------------------
        elif idx == 95:
            itens.append((ts, "Dr. Fábio Monnerat (Procurador Federal / DNIT, FUNASA, INSS)", text))
        elif 96 <= idx <= 98:
            itens.append((ts, "Dr. Eduardo Costa Nassur (Advogado)", text))
        elif 99 <= idx <= 101:
            itens.append((ts, "Dr. Jean Paulo (Advogado)", text))
        elif idx == 102:
            itens.append((ts, "Dr. Rafael Neves Rego (Advogado)", text))
        elif idx == 103:
            itens.append((ts, "Dr. Fernando Pereira Abreu (Advogado / SINDIFISCO)", text))
        elif idx == 104:
            itens.append((ts, "Dr. Cláudio Santos (Advogado / FENASPS)", text))
        elif idx == 105:
            itens.append((ts, "Dr. Sérgio Ludmer (Advogado / UNAFISCO)", text))
        elif 106 <= idx <= 108:
            itens.append((ts, "Dr. Eitel Santiago (Subprocurador-Geral da República / MPF)", text))
        elif 109 <= idx <= 110:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif 111 <= idx <= 112:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

        # ----------------------------------------------------
        # SEÇÃO 5: Tema 1386/STJ - Pensão por Morte (turnos 113 a 124)
        # ----------------------------------------------------
        elif 113 <= idx <= 116:
            itens.append((ts, "Min. Paulo Sérgio Domingues (Presidente em exercício)", text))
        elif 117 <= idx <= 119:
            itens.append((ts, "Dra. Juliana Florentino de Moura (Procuradora do Estado do Rio de Janeiro)", text))
        elif idx == 120:
            itens.append((ts, "Min. Gurgel de Faria (Relator)", text))
        elif 121 <= idx <= 124:
            itens.append((ts, "Min. Paulo Sérgio Domingues (Presidente em exercício)", text))

        # ----------------------------------------------------
        # SEÇÃO 6: Tema 1364/STJ - PIS/COFINS Frete (turnos 125 a 145)
        # ----------------------------------------------------
        elif idx == 125:
            itens.append((ts, "Dr. Bruno Rodrigues (Advogado)", text))
        elif 126 <= idx <= 128:
            itens.append((ts, "Dr. Marcelo Tonette Júnior (Advogado)", text))
        elif 129 <= idx <= 130:
            itens.append((ts, "Dra. Ariane Costa dos Santos (Advogada / FIEP)", text))
        elif idx == 131:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 132 <= idx <= 137:
            itens.append((ts, "Min. Paulo Sérgio Domingues (Relator)", text))
        elif idx == 138:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 139:
            itens.append((ts, "Dra. Rafaela (Procuradora da Fazenda Nacional)", text))
        elif 140 <= idx <= 145:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

        # ----------------------------------------------------
        # SEÇÃO 7: Tema 1454/STJ - Honorários art. 19 (turnos 146 a 153)
        # ----------------------------------------------------
        elif 146 <= idx <= 147:
            itens.append((ts, "Dra. Sara Mendes (Procuradora da Fazenda Nacional)", text))
        elif idx == 148:
            itens.append((ts, "Dr. Gabriel Galvão (Procurador Federal / ANS)", text))
        elif 149 <= idx <= 151:
            itens.append((ts, "Min. Sérgio Kukina (Relator)", text))
        elif idx == 152:
            itens.append((ts, "Min. Paulo Sérgio Domingues", text))
        elif idx == 153:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

        # ----------------------------------------------------
        # SEÇÃO 8: Tema 1432/STJ - Desapropriação / Contemporaneidade (turnos 154 a 231)
        # ----------------------------------------------------
        elif idx in (154, 155):
            # Pregão explícito do Tema 1432/STJ
            if idx == 155:
                texto_pregao = (
                    "Convido o Dr. Fábio Monnerat para vir à tribuna, representando o Instituto Nacional de "
                    "Colonização e Reforma Agrária (INCRA), e apregoo os processos afetados ao Tema 1432/STJ: "
                    "REsp 1.809.093/CE, REsp 1.814.350/SE, REsp 1.950.981/PE e REsp 2.004.109/SE, da relatoria do Min. Afrânio Vilela. "
                    "Indago se todos dispensam a leitura do relatório."
                )
                itens.append((ts, "Min. Gurgel de Faria (Presidente)", texto_pregao))
            else:
                itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 156:
            itens.append((ts, "Dr. Fábio Monnerat (Procurador Federal / INCRA)", text))
        elif idx == 157:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif 158 <= idx <= 159:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx == 160:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif 161 <= idx <= 165:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx in (166, 167):
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 168:
            # Turno 168 contém o agradecimento de Afrânio E o início da manifestação magistral do Min. Herman Benjamin
            m_hb = re.search(r"Bem,\s+eu\s+agradeço\s+eh\s+presidente", text, re.IGNORECASE)
            if m_hb:
                fala_afran = text[:m_hb.start()]
                fala_herman = text[m_hb.start():]
                itens.append(("04:24:17", "Min. Afrânio Vilela (Relator)", fala_afran))
                itens.append(("04:24:51", "Min. Herman Benjamin", fala_herman))
            else:
                itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif 169 <= idx <= 172:
            # Min. Gurgel indaga, Min. Maria Thereza pede palavra e Min. Afrânio esclarece juros compensatórios
            if idx == 169:
                itens.append((ts, "Min. Gurgel de Faria (Presidente)", "Algum colega gostaria de se pronunciar?"))
            elif idx == 170:
                itens.append((ts, "Min. Maria Thereza de Assis Moura", "Presidente, rapidamente."))
            elif idx in (171, 172):
                itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx == 173:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 174:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif 175 <= idx <= 177:
            itens.append((ts, "Min. Herman Benjamin", text))
        elif idx == 178:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx in (179, 180):
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx in (181, 182):
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx in (183, 184):
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 185:
            itens.append((ts, "Min. Maria Thereza de Assis Moura", text))
        elif idx == 186:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif 187 <= idx <= 209:
            if "reforma agrária" in text.lower() or "1950" in text or "desapropriação" in text or "monnerat" in text.lower() or "poderia fazer um esclarecimento" in text.lower():
                itens.append((ts, "Dr. Fábio Monnerat (Procurador Federal / INCRA)", text))
            else:
                itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif 210 <= idx <= 226:
            if "vamos seguir a linha" in text.lower() or "suspender" in text.lower() or "proclamado" in text.lower() or "senhor presidente, posso fazer" in text.lower():
                itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
            else:
                itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx == 227:
            m_susp = re.search(r"ficam\s+suspensos", text, re.IGNORECASE)
            if m_susp:
                fala_afran = text[:m_susp.start()].strip()
                fala_gurgel = text[m_susp.start():].strip()
                itens.append((ts, "Min. Afrânio Vilela (Relator)", fala_afran))
                itens.append(("04:42:43", "Min. Gurgel de Faria (Presidente)", fala_gurgel))
            else:
                itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        elif idx in (228, 230, 231):
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 229:
            itens.append((ts, "Min. Afrânio Vilela (Relator)", text))

        # ----------------------------------------------------
        # SEÇÃO 9: Encerramento e EDcl (turnos 232 a 237)
        # ----------------------------------------------------
        elif idx in (232, 233):
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 234:
            m_gurgel = re.search(r"feito\.\s+Então,?\s+já\s+proclamada", text, re.IGNORECASE)
            if m_gurgel:
                fala_ps = text[:m_gurgel.start()].strip()
                fala_gurgel = "Perfeito. Então, já proclamada" + text[m_gurgel.end():].strip()
                if fala_ps:
                    itens.append(("04:44:27", "Min. Paulo Sérgio Domingues", fala_ps))
                itens.append(("04:44:31", "Min. Gurgel de Faria (Presidente)", fala_gurgel))
            else:
                itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 235:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))
        elif idx == 236:
            m_encerra = re.search(r"indago\s+eh\s+aos\s+pares", text, re.IGNORECASE)
            if m_encerra:
                fala_afran = text[:m_encerra.start()].strip()
                fala_gurgel = "Indago aos pares" + text[m_encerra.end():].strip()
                itens.append(("04:45:32", "Min. Afrânio Vilela (Relator)", fala_afran))
                itens.append(("04:45:44", "Min. Gurgel de Faria (Presidente)", fala_gurgel))
            else:
                itens.append((ts, "Min. Afrânio Vilela (Relator)", text))
        else:
            itens.append((ts, "Min. Gurgel de Faria (Presidente)", text))

    return itens


def gerar_transcricao_saneada():
    dialogues = extrair_falas_brutas()
    print(f"Total de turnos de diálogo brutos extraídos: {len(dialogues)}")

    itens_mapeados = mapear_e_desmembrar_falas(dialogues)
    print(f"Total de falas mapeadas e desmembradas: {len(itens_mapeados)}")

    # Agrupar falas consecutivas do mesmo orador
    paragrafos: list[tuple[str, str, str]] = []
    orador_atual = None
    ts_atual = None
    textos_atual: list[str] = []

    for ts, orador, text in itens_mapeados:
        texto_limpo = limpar_texto(text)
        if not texto_limpo:
            continue

        if orador == orador_atual and len(" ".join(textos_atual)) < 800:
            textos_atual.append(texto_limpo)
        else:
            if orador_atual and textos_atual:
                paragrafos.append((ts_atual, orador_atual, " ".join(textos_atual)))
            orador_atual = orador
            ts_atual = ts
            textos_atual = [texto_limpo]

    if orador_atual and textos_atual:
        paragrafos.append((ts_atual, orador_atual, " ".join(textos_atual)))

    print(f"Total de parágrafos oratórios consolidados: {len(paragrafos)}")

    # Montar Markdown final
    linhas = [
        "# Transcrição Revisada e Saneada — Primeira Seção (14/10/2026)",
        "",
        "- **Órgão Julgador:** Primeira Seção — Superior Tribunal de Justiça",
        "- **Data da Sessão:** 14/10/2026",
        "- **Duração da Transmissão:** 4h 47min",
        "- **Vídeo Original:** [Primeira Seção - STJ - 14/10/2026](https://www.youtube.com/watch?v=59Xi4wO9VVs)",
        "- **Saneamento Taquigráfico:** Eliminação integral de vinhetas pré-sessão, correção fonética de nomes/acórdãos e estruturação por interlocutor",
        "",
        "---",
        "",
        "## Transcrição Organizada por Interlocutor e Minutagem",
        "",
    ]

    for ts, orador, texto in paragrafos:
        if "Herman Benjamin" in orador:
            linhas.append(f"**[{ts}] Min. Herman Benjamin:** {texto}")
        else:
            linhas.append(f"**[{ts}] {orador}:** {texto}")
        linhas.append("")

    md_final = "\n".join(linhas)

    print(f"Gravando em {FILE_DEST_DATA}...")
    with open(FILE_DEST_DATA, "w", encoding="utf-8") as f:
        f.write(md_final)

    print(f"Gravando em {FILE_DEST_WEB}...")
    with open(FILE_DEST_WEB, "w", encoding="utf-8") as f:
        f.write(md_final)

    print("Concluído com pleno sucesso!")


if __name__ == "__main__":
    gerar_transcricao_saneada()
