"""Cliente de integração com Google Gemini (SDK google-genai ou Gemini CLI headless no Windows)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
from collections import deque

from stj_sessoes.config import (
    GEMINI_CLI_COMMAND,
    GEMINI_CLI_TIMEOUT,
    GEMINI_MODEL_FLASH,
    GEMINI_MODEL_PRO,
    GEMINI_RATE_LIMIT_RPM,
)

logger = logging.getLogger(__name__)


class GeminiClient:
    """
    Cliente unificado para geração de texto jurídico com Gemini no Windows.
    Prioriza a API oficial (google-genai) quando GEMINI_API_KEY/GOOGLE_API_KEY estiver definida,
    e utiliza automaticamente o Gemini CLI headless instalado no Windows como backend padrão.
    """

    def __init__(self) -> None:
        self.api_key = (
            os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or ""
        ).strip()
        self.model_pro = GEMINI_MODEL_PRO
        self.model_flash = GEMINI_MODEL_FLASH
        self.timeout = GEMINI_CLI_TIMEOUT
        self.rate_limit = max(1, GEMINI_RATE_LIMIT_RPM)
        self._request_times: deque[float] = deque(maxlen=self.rate_limit)
        self._lock = threading.Lock()

        self.cli_executable = self._resolver_cli_windows(GEMINI_CLI_COMMAND)
        self.disponivel = bool(self.api_key or self.cli_executable)

    @staticmethod
    def _resolver_cli_windows(comando: str) -> str | None:
        for candidato in (comando, "gemini.cmd", "gemini.ps1", "gemini"):
            encontrado = shutil.which(candidato)
            if encontrado:
                return encontrado
        return None

    def _aguardar_rate_limit(self) -> None:
        with self._lock:
            agora = time.monotonic()
            if len(self._request_times) >= self.rate_limit:
                mais_antigo = self._request_times[0]
                decorrido = agora - mais_antigo
                if decorrido < 60.0:
                    espera = 60.0 - decorrido + 0.2
                    time.sleep(espera)
            self._request_times.append(time.monotonic())

    def gerar_conteudo(
        self,
        prompt: str,
        tier: str = "pro",
    ) -> tuple[bool, str, str | None]:
        """
        Gera conteúdo via Gemini.
        Args:
            prompt: Prompt completo de entrada.
            tier: 'pro' (para resumos jurídicos complexos) ou 'flash' (para saneamento textual rápido).
        Returns:
            (sucesso, texto_gerado, mensagem_erro)
        """
        if not self.disponivel:
            return False, "", "Nenhum backend Gemini disponível (configure GEMINI_API_KEY ou instale gemini CLI)."

        modelo = self.model_pro if tier == "pro" else self.model_flash
        self._aguardar_rate_limit()

        if self.api_key:
            ok, texto, erro = self._gerar_via_sdk(prompt, modelo)
            if ok:
                return True, texto, None
            logger.warning("Falha no SDK Gemini (%s); tentando fallback CLI...", erro)

        if self.cli_executable:
            return self._gerar_via_cli(prompt, modelo)

        return False, "", "Falha ao executar chamada Gemini."

    def _gerar_via_sdk(self, prompt: str, modelo: str) -> tuple[bool, str, str | None]:
        try:
            from google import genai

            client = genai.Client(api_key=self.api_key)
            response = client.models.generate_content(
                model=modelo,
                contents=prompt,
            )
            texto = (response.text or "").strip()
            if not texto:
                return False, "", "Resposta vazia da API Gemini."
            return True, texto, None
        except Exception as exc:
            return False, "", str(exc)

    def _gerar_via_cli(self, prompt: str, modelo: str) -> tuple[bool, str, str | None]:
        if not self.cli_executable:
            return False, "", "Executável do Gemini CLI não encontrado."

        # No Windows, passamos prompt via stdin e um argumento posicional sem espaços
        # para evitar que o wrapper .cmd divida palavras ou conflite com a flag depreciada -p.
        cmd_base = [
            self.cli_executable,
            "-m",
            modelo,
            "-o",
            "text",
            "Responder:",
        ]

        if os.name == "nt" and self.cli_executable.lower().endswith(".ps1"):
            cmd = ["pwsh", "-NoProfile", "-NonInteractive", "-File", *cmd_base]
        elif os.name == "nt" and self.cli_executable.lower().endswith(".cmd"):
            cmdline = subprocess.list2cmdline(cmd_base)
            cmd = ["cmd", "/d", "/s", "/c", cmdline]
        else:
            cmd = cmd_base

        env = os.environ.copy()
        for k in list(env.keys()):
            if k.startswith("GEMINI_CLI_IDE"):
                del env[k]

        try:
            proc = subprocess.run(
                cmd,
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=self.timeout,
                env=env,
            )
            if proc.returncode != 0:
                # Fallback sem flag -m caso a versão local do CLI use modelo default
                cmd_fallback = [c for c in cmd_base if c not in ("-m", modelo)]
                if os.name == "nt" and self.cli_executable.lower().endswith(".ps1"):
                    cmd_fb = ["pwsh", "-NoProfile", "-NonInteractive", "-File", *cmd_fallback]
                elif os.name == "nt" and self.cli_executable.lower().endswith(".cmd"):
                    cmd_fb = ["cmd", "/d", "/s", "/c", subprocess.list2cmdline(cmd_fallback)]
                else:
                    cmd_fb = cmd_fallback

                proc = subprocess.run(
                    cmd_fb,
                    input=prompt,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=self.timeout,
                    env=env,
                )
                if proc.returncode != 0:
                    erro_msg = (proc.stderr or proc.stdout or f"Exit code {proc.returncode}").strip()
                    return False, "", erro_msg

            saida = (proc.stdout or "").strip()
            if not saida:
                return False, "", "Saída vazia do Gemini CLI."

            # Caso o CLI retorne envelope JSON por configuração global
            if saida.startswith("{") and '"response"' in saida:
                try:
                    parsed = json.loads(saida)
                    saida = str(parsed.get("response") or saida).strip()
                except json.JSONDecodeError:
                    pass

            return True, saida, None
        except subprocess.TimeoutExpired:
            return False, "", f"Timeout após {self.timeout}s no Gemini CLI."
        except Exception as exc:
            return False, "", str(exc)
