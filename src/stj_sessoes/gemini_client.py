"""Cliente de integração com Google Gemini via Gemini CLI headless (conta Google / assinatura)."""

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

# Variáveis que fariam o CLI (ou bibliotecas Google) usar chave de API ou Vertex em vez do login OAuth.
# São sempre removidas do ambiente do subprocesso: o pipeline nunca consome chave de API.
VARIAVEIS_CREDENCIAL_API: tuple[str, ...] = (
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_APPLICATION_CREDENTIALS",
)

# Trechos de saída que indicam que o CLI não tem sessão Google válida e tentou login interativo.
SINAIS_FALTA_LOGIN: tuple[str, ...] = (
    "failed to open browser",
    "login required",
    "please sign in",
    "authenticate",
    "oauth",
)

MENSAGEM_FALTA_LOGIN = (
    "Gemini CLI sem sessão Google válida. Abra um terminal, rode `gemini`, entre com a conta "
    "da assinatura e execute o pipeline de novo."
)


def montar_ambiente_cli(base: dict[str, str] | None = None) -> dict[str, str]:
    """Copia o ambiente removendo credenciais de API e variáveis de integração com IDE."""
    env = dict(os.environ if base is None else base)
    for chave in list(env.keys()):
        if chave in VARIAVEIS_CREDENCIAL_API or chave.startswith("GEMINI_CLI_IDE"):
            del env[chave]
    return env


class GeminiClient:
    """
    Cliente para geração de texto jurídico com Gemini no Windows.
    Usa exclusivamente o Gemini CLI autenticado com a conta Google (cota da assinatura).
    Chaves de API (GEMINI_API_KEY/GOOGLE_API_KEY) são ignoradas e nunca repassadas ao CLI.
    """

    def __init__(self) -> None:
        self.model_pro = GEMINI_MODEL_PRO
        self.model_flash = GEMINI_MODEL_FLASH
        self.timeout = GEMINI_CLI_TIMEOUT
        self.rate_limit = max(1, GEMINI_RATE_LIMIT_RPM)
        self._request_times: deque[float] = deque(maxlen=self.rate_limit)
        self._lock = threading.Lock()
        self._erro_login: str | None = None

        self.cli_executable = self._resolver_cli_windows(GEMINI_CLI_COMMAND)
        self.disponivel = bool(self.cli_executable)
        # STJ_GEMINI_DESATIVADO=1 impede qualquer chamada real (ex.: nos testes automatizados)
        if os.environ.get("STJ_GEMINI_DESATIVADO") == "1":
            self.disponivel = False

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
        Gera conteúdo via Gemini CLI.
        Args:
            prompt: Prompt completo de entrada.
            tier: 'pro' (para resumos jurídicos complexos) ou 'flash' (para saneamento textual rápido).
        Returns:
            (sucesso, texto_gerado, mensagem_erro)
        """
        if not self.disponivel:
            return False, "", "Gemini CLI não encontrado (instale com `npm install -g @google/gemini-cli`)."

        # Depois de detectada falta de login, não insiste: evita travar o pipeline a cada segmento
        if self._erro_login:
            return False, "", self._erro_login

        modelo = self.model_pro if tier == "pro" else self.model_flash
        self._aguardar_rate_limit()
        return self._gerar_via_cli(prompt, modelo)

    def _montar_comando(self, cmd_base: list[str]) -> list[str]:
        if os.name == "nt" and self.cli_executable.lower().endswith(".ps1"):
            return ["pwsh", "-NoProfile", "-NonInteractive", "-File", *cmd_base]
        if os.name == "nt" and self.cli_executable.lower().endswith(".cmd"):
            return ["cmd", "/d", "/s", "/c", subprocess.list2cmdline(cmd_base)]
        return cmd_base

    def _registrar_se_falta_login(self, saida: str) -> bool:
        texto = (saida or "").lower()
        if any(sinal in texto for sinal in SINAIS_FALTA_LOGIN):
            self._erro_login = MENSAGEM_FALTA_LOGIN
            logger.error(MENSAGEM_FALTA_LOGIN)
            return True
        return False

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
        env = montar_ambiente_cli()

        try:
            proc = subprocess.run(
                self._montar_comando(cmd_base),
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=self.timeout,
                env=env,
            )
            if proc.returncode != 0:
                erro_msg = (proc.stderr or proc.stdout or f"Exit code {proc.returncode}").strip()
                if self._registrar_se_falta_login(erro_msg):
                    return False, "", MENSAGEM_FALTA_LOGIN

                # Fallback sem flag -m caso a versão local do CLI use modelo default
                cmd_fallback = [c for c in cmd_base if c not in ("-m", modelo)]
                proc = subprocess.run(
                    self._montar_comando(cmd_fallback),
                    input=prompt,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=self.timeout,
                    env=env,
                )
                if proc.returncode != 0:
                    erro_msg = (proc.stderr or proc.stdout or f"Exit code {proc.returncode}").strip()
                    if self._registrar_se_falta_login(erro_msg):
                        return False, "", MENSAGEM_FALTA_LOGIN
                    return False, "", erro_msg

            saida = (proc.stdout or "").strip()
            if not saida:
                if self._registrar_se_falta_login(proc.stderr or ""):
                    return False, "", MENSAGEM_FALTA_LOGIN
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
