#!/usr/bin/env python3
"""
CLI principal para captura, saneamento de transcrição, resumo jurídico e atualização do portal
das sessões da Primeira Turma e da Primeira Seção do STJ (GMHB).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from stj_sessoes.config import (  # noqa: E402
    DEFAULT_MAX_CHUNK_THREADS,
    OUTPUT_DIR,
    YOUTUBE_CANAL_STJ,
    ensure_directories,
)
from stj_sessoes.gemini_client import GeminiClient  # noqa: E402
from stj_sessoes.session_summarizer import (  # noqa: E402
    envolver_markdown_resumo,
    gerar_resumo_sessao,
)
from stj_sessoes.site_builder import compilar_site  # noqa: E402
from stj_sessoes.taxonomy import nome_orgao_canonico  # noqa: E402
from stj_sessoes.transcript_sanitizer import (  # noqa: E402
    formatar_data_br,
    sanear_e_revisar_transcricao,
)
from stj_sessoes.youtube_client import (  # noqa: E402
    VideoInfo,
    YouTubeClient,
    formatar_duracao,
)

logger = logging.getLogger("stj_sessoes")


def configurar_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(REPO_ROOT / "stj_sessoes.log", encoding="utf-8"),
        ],
    )


def gerar_markdown_transcricao_bruta(video: VideoInfo, transcricao_bruta: str) -> str:
    orgao_nome = nome_orgao_canonico(video.orgao)
    data_br = formatar_data_br(video.upload_date)
    duracao = formatar_duracao(video.duration)
    return (
        f"# Transcrição Bruta — {orgao_nome} — {data_br}\n\n"
        f"- **Vídeo:** [{video.title}]({video.url})\n"
        f"- **Data:** {data_br}\n"
        f"- **Duração:** {duracao}\n"
        f"- **Órgão:** {orgao_nome}\n\n"
        f"---\n\n"
        f"## Legendas Extraídas\n\n"
        f"{transcricao_bruta}\n"
    )


def atualizar_index_json(output_dir: Path, video: VideoInfo, arquivos: dict[str, str]) -> None:
    index_path = output_dir / "index.json"
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            index = {"videos": []}
    else:
        index = {"videos": []}

    index["videos"] = [v for v in index.get("videos", []) if v.get("video_id") != video.video_id]
    index["videos"].append(
        {
            **video.to_dict(),
            "processado_em": datetime.now().isoformat(),
            "arquivos": arquivos,
        }
    )
    index["videos"].sort(key=lambda v: v.get("upload_date", ""), reverse=True)
    index["ultima_atualizacao"] = datetime.now().isoformat()
    index["total_videos"] = len(index["videos"])
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


def processar_video(
    video: VideoInfo,
    yt_client: YouTubeClient,
    gemini_client: GeminiClient,
    output_dir: Path,
    apenas_transcrever: bool = False,
    saneamento_rapido: bool = False,
    force: bool = False,
    max_threads: int = DEFAULT_MAX_CHUNK_THREADS,
) -> dict[str, str]:
    orgao_nome = nome_orgao_canonico(video.orgao)
    logger.info(
        "Processando sessão: %s | Órgão: %s | Data: %s | ID: %s",
        video.title,
        orgao_nome,
        video.upload_date,
        video.video_id,
    )

    orgao_dir = output_dir / video.orgao
    orgao_dir.mkdir(parents=True, exist_ok=True)
    data_slug = video.upload_date or "sem_data"
    nome_base = f"{data_slug}_{video.orgao}_{video.video_id}"
    arquivos: dict[str, str] = {}

    # 1. Obter transcrição bruta
    ok, transcricao_bruta, erro = yt_client.obter_transcricao_bruta(video.video_id, force=force)
    if not ok or not transcricao_bruta:
        logger.warning("Transcrição indisponível para %s: %s", video.video_id, erro)
        return arquivos

    arq_bruta = orgao_dir / f"{nome_base}_transcricao_bruta.md"
    arq_bruta.write_text(
        gerar_markdown_transcricao_bruta(video, transcricao_bruta),
        encoding="utf-8",
    )
    arquivos["transcricao_bruta"] = arq_bruta.relative_to(output_dir).as_posix()

    # 2. Gerar transcrição revisada e saneada (com minutagem e organização)
    cached_rev = None if force else yt_client.carregar_cache(video.video_id, "transcricao_revisada")
    if cached_rev:
        logger.info("Transcrição revisada carregada do cache: %s", video.video_id)
        doc_revisada = cached_rev
    else:
        doc_revisada = sanear_e_revisar_transcricao(
            video=video,
            transcricao_bruta=transcricao_bruta,
            gemini_client=gemini_client,
            usar_llm=(not saneamento_rapido),
            max_threads=max_threads,
        )
        yt_client.salvar_cache(video.video_id, "transcricao_revisada", doc_revisada)

    arq_revisada = orgao_dir / f"{nome_base}_transcricao_revisada.md"
    arq_revisada.write_text(doc_revisada, encoding="utf-8")
    arquivos["transcricao_revisada"] = arq_revisada.relative_to(output_dir).as_posix()

    try:
        from stj_sessoes.docx_exporter import exportar_transcricao_para_docx

        arq_revisada_docx = orgao_dir / f"{nome_base}_transcricao_revisada.docx"
        exportar_transcricao_para_docx(
            markdown_transcricao=doc_revisada,
            output_path=arq_revisada_docx,
            video_url=video.url,
            orgao=orgao_nome,
            data_sessao=formatar_data_br(video.upload_date),
            titulo_sessao=video.title,
        )
        arquivos["transcricao_revisada_docx"] = arq_revisada_docx.relative_to(output_dir).as_posix()
    except Exception as exc:
        logger.warning("Não foi possível gerar transcrição .docx para %s: %s", video.video_id, exc)

    # 3. Gerar resumo jurídico estruturado (Min. Herman + 15 Matérias + Teses)
    if not apenas_transcrever:
        cached_resumo = None if force else yt_client.carregar_cache(video.video_id, "resumo_canonico")
        cached_meta_str = None if force else yt_client.carregar_cache(video.video_id, "resumo_meta")

        if cached_resumo:
            logger.info("Resumo canônico carregado do cache: %s", video.video_id)
            resumo_canonico = cached_resumo
            resumo_bruto = yt_client.carregar_cache(video.video_id, "resumo_bruto") or cached_resumo
            meta = json.loads(cached_meta_str) if cached_meta_str else {}
        else:
            ok_res, artefatos, erro_res = gerar_resumo_sessao(
                video=video,
                transcricao=doc_revisada,
                gemini_client=gemini_client,
                max_threads=max_threads,
            )
            if not ok_res or not artefatos:
                logger.error("Erro ao gerar resumo de %s: %s", video.video_id, erro_res)
                return arquivos

            resumo_bruto = artefatos.bruto
            resumo_canonico = artefatos.canonico
            meta = artefatos.meta
            yt_client.salvar_cache(video.video_id, "resumo_bruto", resumo_bruto)
            yt_client.salvar_cache(video.video_id, "resumo_canonico", resumo_canonico)
            yt_client.salvar_cache(
                video.video_id,
                "resumo_meta",
                json.dumps(meta, ensure_ascii=False),
            )

        arq_resumo_bruto = orgao_dir / f"{nome_base}_resumo_bruto.md"
        arq_resumo_bruto.write_text(
            envolver_markdown_resumo(video, resumo_bruto),
            encoding="utf-8",
        )
        arquivos["resumo_bruto"] = arq_resumo_bruto.relative_to(output_dir).as_posix()

        arq_resumo = orgao_dir / f"{nome_base}_resumo.md"
        arq_resumo.write_text(
            envolver_markdown_resumo(video, resumo_canonico),
            encoding="utf-8",
        )
        arquivos["resumo"] = arq_resumo.relative_to(output_dir).as_posix()

        arq_meta = orgao_dir / f"{nome_base}_resumo_meta.json"
        arq_meta.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        arquivos["resumo_meta"] = arq_meta.relative_to(output_dir).as_posix()

    return arquivos


def criar_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Captura, saneia e resume sessões da Primeira Turma e Primeira Seção do STJ.",
    )
    fonte = parser.add_mutually_exclusive_group()
    fonte.add_argument("--video-url", type=str, help="URL direta de um vídeo de sessão no YouTube.")
    fonte.add_argument(
        "--canal",
        type=str,
        default=YOUTUBE_CANAL_STJ,
        help=f"URL ou handle do canal (padrão: {YOUTUBE_CANAL_STJ}).",
    )

    parser.add_argument(
        "--orgao",
        type=str,
        choices=["primeira_turma", "primeira_secao", "todos"],
        default="todos",
        help="Filtrar por órgão colegiado (padrão: todos = 1ª Turma e 1ª Seção).",
    )
    parser.add_argument("--data-inicio", type=str, help="Data inicial YYYY-MM-DD.")
    parser.add_argument("--data-fim", type=str, help="Data final YYYY-MM-DD.")
    parser.add_argument("--max-videos", type=int, default=5, help="Máximo de vídeos a processar.")
    parser.add_argument(
        "--max-threads",
        type=int,
        default=DEFAULT_MAX_CHUNK_THREADS,
        help="Máximo de segmentos processados em paralelo.",
    )
    parser.add_argument(
        "--apenas-transcrever",
        action="store_true",
        help="Gera apenas a transcrição bruta e a transcrição revisada, sem resumir.",
    )
    parser.add_argument(
        "--saneamento-rapido",
        action="store_true",
        help="Usa apenas o saneamento determinístico de transcrição (sem chamada extra de IA na transcrição).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignora o cache local e reprocessa integralmente.",
    )
    return parser


def main() -> int:
    ensure_directories()
    configurar_logging()
    args = criar_parser().parse_args()

    yt_client = YouTubeClient()
    gemini_client = GeminiClient()

    if args.video_url:
        orgao_fb = None if args.orgao == "todos" else args.orgao
        info = yt_client.obter_info_video(args.video_url, orgao_fallback=orgao_fb)
        if not info:
            logger.error("Não foi possível validar o vídeo informado para 1ª Turma / 1ª Seção.")
            return 1
        videos = [info]
    else:
        videos = yt_client.listar_sessoes_canal(
            canal=args.canal,
            filtro_orgao=args.orgao,
            data_inicio=args.data_inicio,
            data_fim=args.data_fim,
            max_resultados=args.max_videos,
        )

    if not videos:
        logger.info("Nenhuma sessão encontrada com os critérios informados.")
        return 0

    processados = 0
    for video in videos:
        arquivos = processar_video(
            video=video,
            yt_client=yt_client,
            gemini_client=gemini_client,
            output_dir=OUTPUT_DIR,
            apenas_transcrever=args.apenas_transcrever,
            saneamento_rapido=args.saneamento_rapido,
            force=args.force,
            max_threads=max(1, args.max_threads),
        )
        if arquivos:
            atualizar_index_json(OUTPUT_DIR, video, arquivos)
            processados += 1

    sessoes_site = compilar_site(input_dir=OUTPUT_DIR)
    logger.info(
        "Processamento concluído: %d vídeo(s) processado(s), %d sessão(ões) compilada(s) em web/data.js.",
        processados,
        len(sessoes_site),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
