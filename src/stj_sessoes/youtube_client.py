"""Cliente para listagem de vídeos e extração de transcrições do canal do STJ no YouTube."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from stj_sessoes.config import (
    MIN_DURACAO_SESSAO_SEGUNDOS,
    YOUTUBE_CACHE_DIR,
    YOUTUBE_CANAL_STJ,
)
from stj_sessoes.taxonomy import identificar_orgao

logger = logging.getLogger(__name__)


@dataclass
class VideoInfo:
    """Metadados estruturados de uma transmissão de sessão do STJ."""

    video_id: str
    title: str
    upload_date: str  # YYYY-MM-DD
    url: str
    duration: int  # segundos
    orgao: str  # "primeira_turma" | "primeira_secao"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def formatar_duracao(segundos: int | float) -> str:
    """Converte segundos em representação legível (ex: 3h 45min)."""
    total = int(segundos or 0)
    if total <= 0:
        return "duração não informada"
    horas = total // 3600
    minutos = (total % 3600) // 60
    if horas > 0:
        return f"{horas}h {minutos:02d}min"
    return f"{minutos}min"


def formatar_timestamp(segundos: int | float) -> str:
    """Converte segundos em [HH:MM:SS]."""
    total = max(0, int(segundos or 0))
    horas = total // 3600
    minutos = (total % 3600) // 60
    segs = total % 60
    return f"[{horas:02d}:{minutos:02d}:{segs:02d}]"


def _extrair_data_do_titulo_ou_meta(title: str, upload_date_raw: str | None) -> str:
    """
    Extrai a data da sessão no formato YYYY-MM-DD.
    Prioriza a data explícita no título da transmissão do STJ (ex: '16/06/2026'),
    pois lives encerradas às vezes registram data de upload no dia seguinte em UTC.
    """
    match_titulo = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", title or "")
    if match_titulo:
        dia, mes, ano = match_titulo.groups()
        return f"{ano}-{mes}-{dia}"

    if upload_date_raw and len(str(upload_date_raw)) == 8:
        raw = str(upload_date_raw)
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"

    return ""


class YouTubeClient:
    """Gateway cache-first para vídeos e legendas da Primeira Turma e Primeira Seção do STJ."""

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or YOUTUBE_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.canal_padrao = YOUTUBE_CANAL_STJ

    def cache_path(self, video_id: str, tipo: str) -> Path:
        return self.cache_dir / f"{video_id}_{tipo}.json"

    def carregar_cache(self, video_id: str, tipo: str) -> str | None:
        path = self.cache_path(video_id, tipo)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return payload.get("content")
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cache inválido para %s_%s: %s", video_id, tipo, exc)
            return None

    def salvar_cache(self, video_id: str, tipo: str, conteudo: str) -> None:
        path = self.cache_path(video_id, tipo)
        payload = {
            "video_id": video_id,
            "tipo": tipo,
            "timestamp": datetime.now().isoformat(),
            "content": conteudo,
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def listar_sessoes_canal(
        self,
        canal: str | None = None,
        filtro_orgao: str = "todos",
        data_inicio: str | None = None,
        data_fim: str | None = None,
        max_resultados: int = 15,
        min_duracao_segundos: int = MIN_DURACAO_SESSAO_SEGUNDOS,
    ) -> list[VideoInfo]:
        """
        Lista vídeos do canal @STJnoticias filtrando estritamente Primeira Turma e Primeira Seção.
        """
        import yt_dlp

        url_canal = canal or self.canal_padrao
        if url_canal.startswith("@"):
            url_canal = f"https://www.youtube.com/{url_canal}/streams"

        logger.info("Consultando transmissões do canal: %s", url_canal)

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "playlist_items": f"1:{max(max_resultados * 8, 60)}",
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url_canal, download=False)

        entries = (info or {}).get("entries") or []
        sessoes: list[VideoInfo] = []

        hoje_iso = datetime.now().strftime("%Y-%m-%d")

        for entry in entries:
            if not entry:
                continue

            live_status = (entry.get("live_status") or "").lower()
            if live_status in ("is_upcoming", "upcoming"):
                continue

            video_id = entry.get("id") or ""
            title = entry.get("title") or ""
            duration = int(entry.get("duration") or 0)

            orgao = identificar_orgao(title)
            if not orgao:
                continue

            if filtro_orgao != "todos" and orgao != filtro_orgao:
                continue

            if duration > 0 and duration < min_duracao_segundos:
                continue

            upload_date = _extrair_data_do_titulo_ou_meta(title, entry.get("upload_date"))
            if upload_date and upload_date > hoje_iso and not data_fim:
                logger.info("Ignorando sessão agendada para data futura: %s (%s)", title, upload_date)
                continue

            if not upload_date:
                # Buscar metadado individual caso não conste no título nem no extract_flat
                detalhe = self.obter_info_video(
                    f"https://www.youtube.com/watch?v={video_id}",
                    orgao_fallback=orgao,
                )
                if detalhe:
                    upload_date = detalhe.upload_date
                    duration = duration or detalhe.duration
                    if upload_date and upload_date > hoje_iso and not data_fim:
                        continue

            if data_inicio and upload_date and upload_date < data_inicio:
                continue
            if data_fim and upload_date and upload_date > data_fim:
                continue

            sessoes.append(
                VideoInfo(
                    video_id=video_id,
                    title=title,
                    upload_date=upload_date,
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    duration=duration,
                    orgao=orgao,
                )
            )

            if len(sessoes) >= max_resultados:
                break

        logger.info("Encontradas %d sessões da 1ª Turma / 1ª Seção", len(sessoes))
        return sessoes

    def obter_info_video(
        self,
        video_url: str,
        orgao_fallback: str | None = None,
    ) -> VideoInfo | None:
        """Obtém metadados de um vídeo específico do YouTube."""
        import yt_dlp

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
        except Exception as exc:
            logger.error("Erro ao consultar metadados de %s: %s", video_url, exc)
            return None

        if not info:
            return None

        video_id = info.get("id") or ""
        title = info.get("title") or ""
        duration = int(info.get("duration") or 0)
        orgao = identificar_orgao(title) or orgao_fallback or ""

        if orgao not in ("primeira_turma", "primeira_secao"):
            logger.warning(
                "Vídeo '%s' (%s) não pertence à Primeira Turma nem à Primeira Seção.",
                title,
                video_id,
            )
            return None

        upload_date = _extrair_data_do_titulo_ou_meta(title, info.get("upload_date"))
        return VideoInfo(
            video_id=video_id,
            title=title,
            upload_date=upload_date,
            url=f"https://www.youtube.com/watch?v={video_id}",
            duration=duration,
            orgao=orgao,
        )

    def obter_transcricao_bruta(
        self,
        video_id: str,
        force: bool = False,
    ) -> tuple[bool, str | None, str | None]:
        """
        Extrai a transcrição bruta com timestamps [HH:MM:SS] via youtube-transcript-api.
        """
        if not force:
            cached = self.carregar_cache(video_id, "transcricao_bruta")
            if cached:
                logger.info("Transcrição bruta carregada do cache: %s", video_id)
                return True, cached, None

        try:
            from youtube_transcript_api import YouTubeTranscriptApi

            ytt_api = YouTubeTranscriptApi()
            transcript_list = ytt_api.list(video_id)
            idiomas = ["pt", "pt-BR"]

            transcript = None
            try:
                transcript = transcript_list.find_manually_created_transcript(idiomas)
            except Exception:
                pass

            if transcript is None:
                try:
                    transcript = transcript_list.find_generated_transcript(idiomas)
                except Exception:
                    pass

            if transcript is None:
                return False, None, f"Sem legendas em português disponíveis para {video_id}"

            entries = transcript.fetch()
            linhas: list[str] = []
            for entry in entries:
                if hasattr(entry, "start"):
                    start_sec = float(entry.start)
                    raw_text = str(entry.text).strip()
                else:
                    start_sec = float(entry.get("start", 0))
                    raw_text = str(entry.get("text", "")).strip()

                raw_text = re.sub(r"\s+", " ", raw_text)
                if raw_text:
                    linhas.append(f"{formatar_timestamp(start_sec)} {raw_text}")

            texto_completo = "\n".join(linhas).strip()
            if not texto_completo:
                return False, None, f"Transcrição retornou vazia para {video_id}"

            self.salvar_cache(video_id, "transcricao_bruta", texto_completo)
            return True, texto_completo, None

        except Exception as exc:
            logger.error("Falha ao obter transcrição de %s: %s", video_id, exc)
            return False, None, str(exc)
