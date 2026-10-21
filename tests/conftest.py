"""Configuração comum dos testes: nenhuma chamada real ao Gemini durante os testes automatizados."""

import os

os.environ["STJ_GEMINI_DESATIVADO"] = "1"
