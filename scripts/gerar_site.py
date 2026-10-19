#!/usr/bin/env python3
"""Regenera web/data.js e web/transcricoes/ a partir dos artefatos existentes em data/output/."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from stj_sessoes.config import (  # noqa: E402
    OUTPUT_DIR,
    WEB_DIR,
    WEB_PAUTAS_DIR,
    WEB_TRANSCRICOES_DIR,
    ensure_directories,
)
from stj_sessoes.site_builder import compilar_site  # noqa: E402


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    ensure_directories()
    sessoes = compilar_site(
        input_dir=OUTPUT_DIR,
        output_file=WEB_DIR / "data.js",
        web_transcricoes_dir=WEB_TRANSCRICOES_DIR,
        web_pautas_dir=WEB_PAUTAS_DIR,
    )
    print(f"Portal atualizado em {WEB_DIR / 'data.js'} ({len(sessoes)} sessoes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
