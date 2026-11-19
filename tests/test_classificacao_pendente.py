import json

from stj_sessoes.site_builder import classificar_categoria_resultado, compilar_site, extrair_processos_estruturados


def test_resultado_parcial_preserva_natureza_do_ato():
    assert classificar_categoria_resultado("Embargos parcialmente acolhidos, sem efeitos modificativos") == (
        "parcial", "Parcialmente acolhido"
    )
    assert classificar_categoria_resultado("Conheceu parcialmente e negou provimento") == (
        "desprovido", "Desprovido"
    )
    assert classificar_categoria_resultado("ADIAMENTO DE JULGAMENTO")[0] == "adiado"
    assert classificar_categoria_resultado("DEU PROVIMENTO")[0] == "provido"


def test_relatoria_sem_intervencao_nao_conta_como_manifestacao():
    resumo = """## Processos Julgados
### 1. REsp 1.234.567/SP
- **Relator:** Min. Herman Benjamin
- **Resultado:** Adiado
"""
    processo = extrair_processos_estruturados(
        resumo, "", usar_subagente_flash=False, exigir_manifestacao_explicita=True
    )[0]
    assert processo["isHermanRelator"] is True
    assert processo["hasHerman"] is False


def test_materia_e_resultado_pendentes_nao_recebem_valores_automaticos(tmp_path, monkeypatch):
    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    resumo = """# Sessão

## Processos Julgados

### 1. REsp 1.234.567/SP — Exemplo
- **Matéria:** Pendente de confirmação.
- **Relator:** Min. Gurgel de Faria
- **Resumo da Discussão:** Questão em análise.

### 2. REsp 1.234.568/SP — Exemplo
- **Matéria:** 8. Direito Tributário
- **Resultado:** Pedido de vista
"""
    processos = extrair_processos_estruturados(resumo, "", usar_subagente_flash=False)
    assert processos[0]["materia"] is None
    assert processos[0]["resultadoLabel"] == "Resultado não informado"
    assert processos[1]["materia"]["id"] == 8
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text(resumo, encoding="utf-8")
    (dados / "index.json").write_text(json.dumps({"videos": [{
        "orgao": "primeira_turma", "upload_date": "2026-11-10",
        "arquivos": {"resumo": "resumo.md"},
    }]}), encoding="utf-8")
    web = tmp_path / "web"
    sessoes = compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")
    assert sessoes[0]["processes"][0]["materia"] is None
    assert [m["id"] for m in sessoes[0]["materias"]] == [8]
