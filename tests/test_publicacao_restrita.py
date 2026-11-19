import json

import pytest

from stj_sessoes.site_builder import compilar_site


def test_sessao_restrita_nao_expoe_fontes_privadas(tmp_path, monkeypatch):
    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n\n## Destaques\n", encoding="utf-8")
    (dados / "transcricao.md").write_text("NOME PRIVADO", encoding="utf-8")
    (dados / "pauta.pdf").write_bytes(b"PDF PRIVADO")
    (dados / "pauta.json").write_text(json.dumps({
        "url_pauta_pdf": "https://example.test/privado.pdf",
        "documentos": [{"url": "https://example.test/privado.pdf"}],
        "itens": [{"item": 1, "processo": "REsp 123/SP", "segredo_justica": True,
                   "partes": ["NOME PRIVADO"], "outro_campo": "NOME PRIVADO",
                   "assunto": "NOME PRIVADO", "resultado_oficial": "NOME PRIVADO"}],
    }), encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True,
             "arquivos": {"resumo": "resumo.md", "pauta_json": "pauta.json",
                          "pauta_pdf": "pauta.pdf", "transcricao_revisada": "transcricao.md"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    sessoes = compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")
    assert "NOME PRIVADO" not in (web / "data.js").read_text(encoding="utf-8")
    assert "privado.pdf" not in (web / "data.js").read_text(encoding="utf-8")
    assert not list((web / "pautas").glob("*.pdf"))
    assert not list((web / "transcricoes").glob("*"))
    assert sessoes[0]["pauta"]["itens"][0]["segredo_justica"] is True
    assert "partes" not in sessoes[0]["pauta"]["itens"][0]
    for arquivo in (web / "assistente").rglob("*"):
        if arquivo.is_file():
            assert "NOME PRIVADO" not in arquivo.read_text(encoding="utf-8")

    (web / "pautas" / "2026-11-10_primeira_turma_pauta.pdf").write_bytes(b"PDF PRIVADO")
    with pytest.raises(ValueError, match="Artefato público anterior"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")


def test_restrita_bloqueia_docx_antigo_mesmo_com_transcricao_publica(tmp_path, monkeypatch):
    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    (dados / "publica.md").write_text("Transcrição tratada", encoding="utf-8")
    (dados / "pauta.json").write_text('{"itens": []}', encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True,
             "arquivos": {"resumo": "resumo.md", "pauta_json": "pauta.json",
                          "transcricao_publica": "publica.md"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    (web / "transcricoes").mkdir(parents=True)
    antigo = web / "transcricoes" / "2026-11-10_primeira_turma_transcricao_revisada.docx"
    antigo.write_bytes(b"DOCX ANTERIOR")
    with pytest.raises(ValueError, match="Artefato público anterior"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")
    assert antigo.read_bytes() == b"DOCX ANTERIOR"
    assert not (web / "data.js").exists()


def test_restrita_nao_usa_pauta_inferida_quando_indice_nao_a_declara(tmp_path, monkeypatch):
    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    (dados / "resumo.md_pauta.json").write_text('{"itens": []}', encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True, "arquivos": {"resumo": "resumo.md"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    with pytest.raises(ValueError, match="Pauta identificada no índice"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")


def test_restrita_permite_rebuild_verificado_e_falha_preserva_artefatos(tmp_path, monkeypatch):
    import stj_sessoes.docx_exporter as exporter

    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    publica = dados / "publica.md"
    publica.write_text("Transcrição tratada inicial", encoding="utf-8")
    (dados / "pauta.json").write_text('{"itens": []}', encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True,
             "arquivos": {"resumo": "resumo.md", "pauta_json": "pauta.json",
                          "transcricao_publica": "publica.md"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    args = (dados, web / "data.js", web / "transcricoes", web / "pautas")
    compilar_site(*args)
    compilar_site(*args)
    md = web / "transcricoes" / "2026-11-10_primeira_turma_transcricao_revisada.md"
    docx = web / "transcricoes" / "2026-11-10_primeira_turma_transcricao_revisada.docx"
    original_md, original_docx = md.read_bytes(), docx.read_bytes()
    publica.write_text("Transcrição tratada modificada", encoding="utf-8")

    def falhar(**kwargs):
        raise RuntimeError("Falha simulada")

    monkeypatch.setattr(exporter, "exportar_transcricao_para_docx", falhar)
    with pytest.raises(RuntimeError, match="Falha simulada"):
        compilar_site(*args)
    assert md.read_bytes() == original_md
    assert docx.read_bytes() == original_docx

    def gerar_invalido(**kwargs):
        kwargs["output_path"].write_bytes(b"ARQUIVO INVALIDO")

    monkeypatch.setattr(exporter, "exportar_transcricao_para_docx", gerar_invalido)
    with pytest.raises(ValueError, match="DOCX não gerou arquivo válido"):
        compilar_site(*args)
    assert md.read_bytes() == original_md
    assert docx.read_bytes() == original_docx

    docx.write_bytes(b"ALTERADO SEM REVISAO")
    with pytest.raises(ValueError, match="Artefato público anterior"):
        compilar_site(*args)


def test_restrita_restaura_primeira_troca_se_segunda_falhar(tmp_path, monkeypatch):
    from pathlib import Path

    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    publica = dados / "publica.md"
    publica.write_text("Versão anterior", encoding="utf-8")
    (dados / "pauta.json").write_text('{"itens": []}', encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True,
             "arquivos": {"resumo": "resumo.md", "pauta_json": "pauta.json", "transcricao_publica": "publica.md"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    args = (dados, web / "data.js", web / "transcricoes", web / "pautas")
    compilar_site(*args)
    saidas = [web / "transcricoes" / "2026-11-10_primeira_turma_transcricao_revisada.md",
              web / "transcricoes" / "2026-11-10_primeira_turma_transcricao_revisada.docx",
              web / "transcricoes" / ".2026-11-10_primeira_turma_restrita.json"]
    anteriores = [p.read_bytes() for p in saidas]
    publica.write_text("Versão nova", encoding="utf-8")
    replace = Path.replace

    def falhar_segunda(self, destino):
        if Path(destino) == saidas[1]:
            raise OSError("Segunda troca falhou")
        return replace(self, destino)

    monkeypatch.setattr(Path, "replace", falhar_segunda)
    with pytest.raises(OSError, match="Segunda troca falhou"):
        compilar_site(*args)
    assert [p.read_bytes() for p in saidas] == anteriores


def test_restrita_sem_resumo_detecta_download_antigo(tmp_path):
    dados = tmp_path / "dados"
    dados.mkdir()
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True, "arquivos": {}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    (web / "pautas").mkdir(parents=True)
    (web / "pautas" / "2026-11-10_primeira_turma_pauta.pdf").write_bytes(b"ANTIGO")
    with pytest.raises(ValueError, match="Artefato público anterior"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")


def test_nao_restrita_mantem_download_md_se_exportacao_falhar(tmp_path, monkeypatch):
    import stj_sessoes.docx_exporter as exporter

    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    (dados / "transcricao.md").write_text("Transcrição", encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "arquivos": {"resumo": "resumo.md", "transcricao_revisada": "transcricao.md"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    def falhar(**kwargs):
        raise RuntimeError("Falha simulada")
    monkeypatch.setattr(exporter, "exportar_transcricao_para_docx", falhar)
    web = tmp_path / "web"
    sessoes = compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")
    assert sessoes[0]["transcriptMdUrl"] == "transcricoes/2026-11-10_primeira_turma_transcricao_revisada.md"
    assert sessoes[0]["transcriptDocxUrl"] == ""
    assert (web / sessoes[0]["transcriptMdUrl"]).read_text(encoding="utf-8").strip() == "Transcrição"


@pytest.mark.parametrize("marcador", [None, "false", 0])
def test_restrita_rejeita_marcador_de_sigilo_invalido(tmp_path, marcador):
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    (dados / "pauta.json").write_text(json.dumps({"itens": [{"segredo_justica": marcador}]}), encoding="utf-8")
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": True, "arquivos": {"resumo": "resumo.md", "pauta_json": "pauta.json"}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    with pytest.raises(ValueError, match="marcação de sigilo inválida"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")


def test_multipartes_restrita_sem_resumo_nao_expõe_parte_nao_restrita(tmp_path):
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    (dados / "pauta.pdf").write_bytes(b"PDF PRIVADO")
    comum = {"orgao": "primeira_turma", "upload_date": "2026-11-10"}
    videos = [
        {**comum, "video_id": "primeira", "publicacao_restrita": True, "arquivos": {}},
        {**comum, "video_id": "segunda", "arquivos": {"resumo": "resumo.md", "pauta_pdf": "pauta.pdf"}},
    ]
    (dados / "index.json").write_text(json.dumps({"videos": videos}), encoding="utf-8")
    web = tmp_path / "web"
    with pytest.raises(ValueError, match="Todas as partes de uma sessão restrita"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")
    assert not (web / "data.js").exists()
    assert not (web / "pautas" / "2026-11-10_primeira_turma_pauta.pdf").exists()


@pytest.mark.parametrize("valor", [None, "false", 0])
def test_regime_de_publicacao_invalido_falha_antes_de_compilar(tmp_path, valor):
    dados = tmp_path / "dados"
    dados.mkdir()
    video = {"video_id": "id", "orgao": "primeira_turma", "upload_date": "2026-11-10",
             "publicacao_restrita": valor, "arquivos": {}}
    (dados / "index.json").write_text(json.dumps({"videos": [video]}), encoding="utf-8")
    web = tmp_path / "web"
    with pytest.raises(ValueError, match="regime de publicação deve ser booleano"):
        compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")


def test_reprocessamento_preserva_regime_e_builder_continua_restrito(tmp_path, monkeypatch):
    import importlib.util
    from pathlib import Path
    from stj_sessoes.youtube_client import VideoInfo

    monkeypatch.setenv("STJ_GEMINI_DESATIVADO", "1")
    spec = importlib.util.spec_from_file_location(
        "processar_sessoes_teste", Path(__file__).resolve().parents[1] / "scripts" / "processar_sessoes.py"
    )
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    dados = tmp_path / "dados"
    dados.mkdir()
    (dados / "resumo.md").write_text("# Resumo\n", encoding="utf-8")
    (dados / "pauta.json").write_text(json.dumps({"itens": [
        {"item": 1, "segredo_justica": True, "partes": ["NOME PRIVADO"]}
    ]}), encoding="utf-8")
    (dados / "pauta.pdf").write_bytes(b"PRIVADO")
    (dados / "privada.md").write_text("NOME PRIVADO", encoding="utf-8")
    video = VideoInfo("id", "Primeira Turma", "2026-11-10", "https://example.test/video", 1, "primeira_turma")
    anterior = {**video.to_dict(), "publicacao_restrita": True,
                "arquivos": {"resumo": "resumo.md", "pauta_json": "pauta.json", "pauta_pdf": "pauta.pdf"}}
    (dados / "index.json").write_text(json.dumps({"videos": [anterior]}), encoding="utf-8")
    modulo.atualizar_index_json(dados, video, {"transcricao_revisada": "privada.md"})
    indice = json.loads((dados / "index.json").read_text(encoding="utf-8"))
    assert indice["videos"][0]["publicacao_restrita"] is True
    web = tmp_path / "web"
    compilar_site(dados, web / "data.js", web / "transcricoes", web / "pautas")
    assert "NOME PRIVADO" not in (web / "data.js").read_text(encoding="utf-8")
    assert not list((web / "pautas").glob("*.pdf"))
    assert not list((web / "transcricoes").glob("*.md"))
