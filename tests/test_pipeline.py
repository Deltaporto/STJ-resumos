"""Testes automatizados da suíte STJ-Sessoes-GMHB."""

from __future__ import annotations

import json
from pathlib import Path

from stj_sessoes.site_builder import compilar_site
from stj_sessoes.taxonomy import (
    MATERIAS_GABINETE,
    classificar_processos_via_subagente_flash,
    identificar_orgao,
    obter_materia_por_id,
)
from stj_sessoes.transcript_sanitizer import pre_sanear_transcricao


class StubGeminiFlashClient:
    """Stub do cliente Gemini para testar o subagente classificador Flash."""

    def __init__(self, payload_resposta: dict) -> None:
        self.disponivel = True
        self.payload_resposta = payload_resposta
        self.last_tier: str | None = None
        self.last_prompt: str | None = None

    def gerar_conteudo(self, prompt: str, tier: str = "pro", temperature: float = 0.2) -> tuple[bool, str, str]:
        self.last_prompt = prompt
        self.last_tier = tier
        return True, json.dumps(self.payload_resposta, ensure_ascii=False), ""


def test_identificar_orgao_exclusivo_primeira_turma_e_secao() -> None:
    assert identificar_orgao("Primeira Turma - STJ - 14/04/2026") == "primeira_turma"
    assert identificar_orgao("Sessão da 1ª Turma - Manhã") == "primeira_turma"
    assert identificar_orgao("Primeira Seção - STJ - 13/05/2026") == "primeira_secao"
    assert identificar_orgao("Julgamento 1ª Seção") == "primeira_secao"

    # Outros órgãos devem ser rejeitados
    assert identificar_orgao("Quarta Turma - STJ - 16/06/2026") is None
    assert identificar_orgao("Segunda Seção - STJ - 13/05/2026") is None
    assert identificar_orgao("Segunda Turma - STJ - 10/06/2026") is None
    assert identificar_orgao("Corte Especial - STJ") is None


def test_catalogo_15_materias_do_gabinete() -> None:
    assert len(MATERIAS_GABINETE) == 15

    m1 = obter_materia_por_id(1)
    assert m1["id"] == 1
    assert m1["code"] == "1. Improbidade Administrativa"

    m12 = obter_materia_por_id("12. Direito Ambiental Urbanístico")
    assert m12["id"] == 12
    assert m12["code"] == "12. Direito Ambiental Urbanístico"

    m13 = obter_materia_por_id(13)
    assert m13["id"] == 13
    assert m13["code"] == "13. Direito dos Povos Indígenas"


def test_subagente_classificador_flash_materias_e_julgadores() -> None:
    resposta_flash = {
        "classifications": [
            {
                "index": 1,
                "materia_id": 12,
                "relatores": [
                    {
                        "name": "Min. Herman Benjamin",
                        "role": "titular",
                        "category_label": "Ministros Titulares",
                        "is_herman": True,
                    }
                ],
                "has_herman": True,
                "is_relevant": True,
            },
            {
                "index": 2,
                "materia_id": 4,
                "relatores": [
                    {
                        "name": "Des. Conv. Manoel Erhardt",
                        "role": "convocado_substituto",
                        "category_label": "Desembargadores Convocados / Substitutos",
                        "is_herman": False,
                    }
                ],
                "has_herman": False,
                "is_relevant": False,
            },
        ]
    }
    stub_client = StubGeminiFlashClient(resposta_flash)

    entrada = [
        {
            "index": 1,
            "heading": "REsp 2.100.500/SP - Infração ambiental",
            "raw_materia": "Ambiental",
            "raw_relator": "Min. Erman Benjamim",
            "raw_relevancia": "Alta",
            "hermanManifestation": "Voto condutor sobre dano ecológico.",
            "tese": "A obrigação civil de reparar o dano ambiental é propter rem.",
            "resumoDiscussao": "Debate sobre infração ambiental.",
        },
        {
            "index": 2,
            "heading": "AREsp 1.980.111/RJ - PAD",
            "raw_materia": "Servidor",
            "raw_relator": "Des. Convocado Manoel Erhardt",
            "raw_relevancia": "Ordinária",
            "hermanManifestation": "",
            "tese": "Sindicância investigativa.",
            "resumoDiscussao": "Processo administrativo disciplinar.",
        },
    ]

    resultado = classificar_processos_via_subagente_flash(
        entrada,
        gemini_client=stub_client,  # type: ignore[arg-type]
    )

    assert stub_client.last_tier == "flash"
    assert 1 in resultado
    assert 2 in resultado
    assert resultado[1]["materia"]["id"] == 12
    assert resultado[1]["relatores"][0]["name"] == "Min. Herman Benjamin"
    assert resultado[1]["relatores"][0]["role"] == "titular"
    assert resultado[1]["relatores"][0]["is_herman"] is True
    assert resultado[2]["materia"]["id"] == 4
    assert resultado[2]["relatores"][0]["role"] == "convocado_substituto"
    assert resultado[2]["relatores"][0]["category_label"] == "Desembargadores Convocados / Substitutos"


def test_pre_sanear_transcricao_remove_vinhetas_e_agrupa_minutagem() -> None:
    bruta = "\n".join(
        [
            "[00:00:00] Dificuldade de leitura. A ouvidoria",
            "[00:00:02] conta com atendimento em Libras.",
            "[00:00:10] Um tribunal acessível é um tribunal cidadão.",
            "[00:01:20] Declaro aberta a sessão da Primeira Turma.",
            "[00:01:24] Apregoa-se o item 1 da pauta, recurso especial.",
            "[00:01:30] >> Com a palavra o Ministro Erman Benjamim.",
            "[00:01:35] Trata-se de ação de improbidade administrativa envolvendo súmula sete.",
        ]
    )
    saneada = pre_sanear_transcricao(bruta)
    assert "atendimento em Libras" not in saneada
    assert "Declaro aberta a sessão da Primeira Turma" in saneada
    assert "Min. Herman Benjamin" in saneada
    assert "Súmula 7" in saneada
    assert "[00:01:30]" in saneada


def test_compilar_site_extrai_processos_herman_teses_e_transcricao(tmp_path: Path) -> None:
    out_dir = tmp_path / "output"
    turma_dir = out_dir / "primeira_turma"
    turma_dir.mkdir(parents=True)
    web_dir = tmp_path / "web"
    transc_dir = web_dir / "transcricoes"

    resumo_md = """# Resumo — Primeira Turma — 14/04/2026

**Vídeo:** [Primeira Turma - STJ - 14/04/2026](https://www.youtube.com/watch?v=ABC123xyz)
**Data:** 14/04/2026
**Órgão:** Primeira Turma

---

## Atuação e Manifestações do Min. Herman Benjamin
- **REsp 2.100.500/SP (Início: 00:25:10):** Relatou recurso sobre proteção de área de preservação permanente e responsabilidade administrativa ambiental, fixando distinção relevante.

## Destaques da Sessão
- **REsp 2.100.500/SP:** Julgamento paradigmático sobre infração ambiental e nexo de causalidade.

## Processos Julgados

### 1. REsp 2.100.500/SP - Infração administrativa ambiental e demolição (Início: 00:25:10)
- **Matéria:** 12. Direito Ambiental Urbanístico
- **Relator:** Min. Herman Benjamin
- **Resultado:** Provido
- **Votação:** Unânime
- **Relevância:** Alta — Caso de Destaque
- **Manifestação do Min. Herman Benjamin:** Apresentou voto analítico destacando o princípio *in dubio pro natura* e a imprescritibilidade da reparação do dano ecológico.
- **Tese fixada:** A responsabilidade administrativa ambiental exige demonstração de conduta ilícita própria, mas a obrigação civil de reparar o dano ambiental possui natureza *propter rem*.
- **Resumo da discussão:** O colegiado acompanhou integralmente o relator para restabelecer o auto de infração lavrado pelo IBAMA.

### 2. AREsp 1.980.111/RJ - Processo administrativo disciplinar (Início: 00:52:40)
- **Matéria:** 4. Servidor Público Civil e Militar
- **Relator:** Des. Conv. Manoel Erhardt
- **Resultado:** Desprovido
- **Votação:** Unânime
- **Relevância:** Ordinária
- **Tese fixada:** É prescindível a presença de advogado na fase inicial de sindicância meramente investigativa.
- **Resumo da discussão:** A Primeira Turma negou provimento ao agravo interno do servidor.

## Estatísticas
- Total de processos apreciados: 2
"""
    resumo_file = turma_dir / "2026-04-14_primeira_turma_ABC123xyz_resumo.md"
    resumo_file.write_text(resumo_md, encoding="utf-8")

    # Arquivo de classificação gerado pelo Subagente Gemini 3.8 Flash
    flash_cache_file = turma_dir / "2026-04-14_primeira_turma_ABC123xyz_classificacao_flash.json"
    flash_cache_payload = {
        "classifications": [
            {
                "index": 1,
                "materia_id": 12,
                "relatores": [
                    {
                        "name": "Min. Herman Benjamin",
                        "role": "titular",
                        "category_label": "Ministros Titulares",
                        "is_herman": True,
                    }
                ],
                "has_herman": True,
                "is_relevant": True,
            },
            {
                "index": 2,
                "materia_id": 4,
                "relatores": [
                    {
                        "name": "Des. Conv. Manoel Erhardt",
                        "role": "convocado_substituto",
                        "category_label": "Desembargadores Convocados / Substitutos",
                        "is_herman": False,
                    }
                ],
                "has_herman": False,
                "is_relevant": False,
            },
        ]
    }
    flash_cache_file.write_text(json.dumps(flash_cache_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    transc_file = turma_dir / "2026-04-14_primeira_turma_ABC123xyz_transcricao_revisada.md"
    transc_file.write_text(
        "# Transcrição Revisada\n\n**[00:25:10]** Min. Herman Benjamin profere voto no REsp 2.100.500/SP.\n",
        encoding="utf-8",
    )

    index_payload = {
        "videos": [
            {
                "video_id": "ABC123xyz",
                "title": "Primeira Turma - STJ - 14/04/2026",
                "upload_date": "2026-04-14",
                "url": "https://www.youtube.com/watch?v=ABC123xyz",
                "duration": 7200,
                "orgao": "primeira_turma",
                "arquivos": {
                    "resumo": "primeira_turma/2026-04-14_primeira_turma_ABC123xyz_resumo.md",
                    "transcricao_revisada": "primeira_turma/2026-04-14_primeira_turma_ABC123xyz_transcricao_revisada.md",
                },
            }
        ]
    }
    (out_dir / "index.json").write_text(json.dumps(index_payload, ensure_ascii=False), encoding="utf-8")

    sessoes = compilar_site(
        input_dir=out_dir,
        output_file=web_dir / "data.js",
        web_transcricoes_dir=transc_dir,
    )

    assert len(sessoes) == 1
    s = sessoes[0]
    assert s["orgao"] == "Primeira Turma"
    assert s["stats"]["total"] == 2
    assert s["stats"]["hermanCount"] == 1
    assert len(s["hermanHighlights"]) >= 1
    assert s["processes"][0]["materia"]["id"] == 12
    assert s["processes"][0]["isHermanRelator"] is True
    assert s["processes"][0]["videoUrl"] == "https://www.youtube.com/watch?v=ABC123xyz&t=1510s"
    assert s["processes"][1]["relatores"][0]["role"] == "convocado_substituto"
    assert (transc_dir / "2026-04-14_primeira_turma_transcricao_revisada.md").exists()
    assert (web_dir / "data.js").exists()
