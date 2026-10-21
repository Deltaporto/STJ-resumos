"""Configurações centralizadas do projeto STJ-Sessoes-GMHB."""

from __future__ import annotations

import os
from pathlib import Path

# Diretórios principais do projeto
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _carregar_chave_gemini_local() -> None:
    """Lê a chave do Gemini de arquivos locais (fora do git) quando não está no ambiente.

    Procura, nesta ordem, `.env` na raiz do projeto e `worker/.dev.vars` (o mesmo arquivo
    usado pelo proxy do assistente). Assim a chave fica num lugar só.
    """
    if os.environ.get("STJ_GEMINI_DESATIVADO") == "1":
        return
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return
    for arquivo in (PROJECT_ROOT / ".env", PROJECT_ROOT / "worker" / ".dev.vars"):
        if not arquivo.exists():
            continue
        for linha in arquivo.read_text(encoding="utf-8-sig").splitlines():
            nome, _, valor = linha.partition("=")
            if nome.strip() == "GEMINI_API_KEY":
                valor = valor.strip().strip("\"'").strip()
                if valor and "cole-aqui" not in valor:
                    os.environ["GEMINI_API_KEY"] = valor
                    return


_carregar_chave_gemini_local()

DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
YOUTUBE_CACHE_DIR = CACHE_DIR / "youtube"
PAUTA_CACHE_DIR = CACHE_DIR / "pautas"
OUTPUT_DIR = DATA_DIR / "output"
WEB_DIR = PROJECT_ROOT / "web"
WEB_TRANSCRICOES_DIR = WEB_DIR / "transcricoes"
WEB_PAUTAS_DIR = WEB_DIR / "pautas"
WEB_ASSISTENTE_DIR = WEB_DIR / "assistente"
PAGES_SYNC_DIR = PROJECT_ROOT / ".pages_repo"

# API pública do Calendário de Sessões e Pautas do STJ
STJ_CALENDARIO_API_BASE = os.environ.get(
    "STJ_CALENDARIO_API_BASE",
    "https://calendario-sessoes.web.stj.jus.br/api",
)

# Configurações do canal do STJ no YouTube
YOUTUBE_CANAL_STJ = os.environ.get(
    "STJ_YOUTUBE_CANAL",
    "https://www.youtube.com/@STJnoticias/streams",
)

# Duracao minima padrão (30 minutos) para descartar pílulas/cortes curtos
MIN_DURACAO_SESSAO_SEGUNDOS = int(os.environ.get("STJ_MIN_DURACAO_SEGUNDOS", str(30 * 60)))

# Configurações do Gemini (SDK ou CLI headless)
GEMINI_CLI_COMMAND = os.environ.get("GEMINI_CLI_COMMAND", "gemini")
# Os modelos 2.5 deixaram de estar disponíveis para chaves novas (erro 404); ver https://ai.google.dev/gemini-api/docs/models
GEMINI_MODEL_PRO = os.environ.get("GEMINI_MODEL_PRO", "gemini-3.1-pro-preview")
GEMINI_MODEL_FLASH = os.environ.get("GEMINI_MODEL_FLASH", "gemini-3.8-flash")
GEMINI_CLI_TIMEOUT = int(os.environ.get("GEMINI_CLI_TIMEOUT", "600"))
GEMINI_RATE_LIMIT_RPM = int(os.environ.get("GEMINI_RATE_LIMIT_RPM", "15"))

# Limites de segmentação (chunking)
LIMITE_CARACTERES_RESUMO_CHUNK = int(os.environ.get("STJ_RESUMO_CHUNK_CHARS", "55000"))
LIMITE_CARACTERES_SANEAMENTO_CHUNK = int(os.environ.get("STJ_SANEAMENTO_CHUNK_CHARS", "28000"))
DEFAULT_MAX_CHUNK_THREADS = int(os.environ.get("STJ_CHUNK_THREADS", "2"))

# Repositório remoto do GitHub Pages
GITHUB_PAGES_REMOTE = os.environ.get(
    "STJ_GITHUB_PAGES_REMOTE",
    "https://github.com/Deltaporto/STJ-resumos.git",
)


def ensure_directories() -> None:
    """Garante a existência dos diretórios de trabalho."""
    for directory in (
        DATA_DIR,
        CACHE_DIR,
        YOUTUBE_CACHE_DIR,
        PAUTA_CACHE_DIR,
        OUTPUT_DIR,
        WEB_DIR,
        WEB_TRANSCRICOES_DIR,
        WEB_PAUTAS_DIR,
        WEB_ASSISTENTE_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)
