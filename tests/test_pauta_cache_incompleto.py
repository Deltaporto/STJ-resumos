import json

from stj_sessoes.pauta_client import PautaClient, parsear_pdf_pauta


class Resposta:
    def __init__(self, payload, ok=True):
        self.payload = payload
        self.ok = ok

    def raise_for_status(self):
        if not self.ok:
            raise RuntimeError("indisponível")

    def json(self):
        return self.payload


class ServicoPauta:
    def __init__(self, processos):
        self.processos = processos
        self.chamadas = []

    def get(self, url, **kwargs):
        self.chamadas.append(url)
        if url.endswith("cronograma-sessao"):
            return Resposta({"cronogramas": [{"seq": 1, "dataCronogramaSessao": "2026-11-17",
                "orgaoJulgador": {"codOrgaoJgdr": "T1"}, "tipoSessao": {"seq": 1}}]})
        if url.endswith("/processos"):
            return Resposta(self.processos)
        return Resposta([])


def test_cache_vazio_e_reconsultado_e_atualizado_quando_api_disponibiliza_itens(tmp_path):
    caminho = tmp_path / "2026-11-17_primeira_turma_pauta.json"
    caminho.write_text(json.dumps({"itens": [], "total_itens": 0}), encoding="utf-8")
    cliente = PautaClient(cache_dir=tmp_path)
    cliente.session = ServicoPauta([{"numRegistro": "202600000001", "sgClasse": "REsp",
                                    "numProcClasse": "1234567", "numOrdemDia": 1}])
    pauta = cliente.obter_pauta_sessao("2026-11-17", "primeira_turma")
    assert any(url.endswith("/processos") for url in cliente.session.chamadas)
    assert pauta["total_itens"] == 1
    assert json.loads(caminho.read_text(encoding="utf-8"))["itens"][0]["num_proc_classe"] == "1234567"


def test_consulta_vazia_preserva_cache_anterior_mesmo_em_atualizacao_forcada(tmp_path):
    caminho = tmp_path / "2026-11-17_primeira_turma_pauta.json"
    anterior = {"itens": [{"processo": "REsp 1234567"}], "total_itens": 1}
    conteudo_original = json.dumps(anterior)
    caminho.write_text(conteudo_original, encoding="utf-8")
    cliente = PautaClient(cache_dir=tmp_path)
    cliente.session = ServicoPauta([])
    assert cliente.obter_pauta_sessao("2026-11-17", "primeira_turma", force=True) == anterior
    assert caminho.read_text(encoding="utf-8") == conteudo_original


def test_pdf_com_registro_quebrado_nao_mescla_dados_de_processos(monkeypatch):
    class Pagina:
        def extract_text(self):
            return ("AgInt no RECURSO ESPECIAL Nº 2117851 - RJ (2024/0008135-0)\n"
                    "RELATOR : MINISTRO SÉRGIO KUKINA\nAGRAVANTE : PARTE PRIMEIRA\n"
                    "EDcl no AgInt no AgInt no AGRAVO EM RECURSO ESPECIAL Nº 2147124 - RS "
                    "(2022/0175289-\n1)\nRELATOR : MINISTRO BENEDITO GONÇALVES\n"
                    "EMBARGANTE : PARTE SEGUNDA\n")

    class Leitor:
        def __init__(self, arquivo):
            self.pages = [Pagina()]

    monkeypatch.setattr("stj_sessoes.pauta_client.PdfReader", Leitor)
    pauta = parsear_pdf_pauta(b"pdf simulado")
    primeiro = pauta["202400081350"]
    segundo = pauta["202201752891"]
    assert primeiro["relator_pdf"] == "Min. Sérgio Kukina"
    assert segundo["relator_pdf"] == "Min. Benedito Gonçalves"
    assert [p["nome"] for p in primeiro["partes"]] == ["PARTE PRIMEIRA"]
    assert [p["nome"] for p in segundo["partes"]] == ["PARTE SEGUNDA"]
    assert segundo["classe_completa"] == "EDcl no AgInt no AgInt no AREsp"


def test_pdf_com_incidentes_no_mesmo_registro_nao_associa_partes_ou_classe_a_todos(monkeypatch):
    class Pagina:
        def extract_text(self):
            return ("AgInt nos EDcl no RECURSO ESPECIAL Nº 1970722 - PR (2021/0342285-0)\n"
                    "RELATOR : MINISTRO PAULO SÉRGIO DOMINGUES\nAGRAVANTE : PARTE PRIMEIRA\n"
                    "AgInt no RECURSO ESPECIAL Nº 1970722 - PR (2021/0342285-0)\n"
                    "RELATOR : MINISTRO PAULO SÉRGIO DOMINGUES\nAGRAVANTE : PARTE SEGUNDA\n")

    class Leitor:
        def __init__(self, arquivo):
            self.pages = [Pagina()]

    monkeypatch.setattr("stj_sessoes.pauta_client.PdfReader", Leitor)
    registro = parsear_pdf_pauta(b"pdf simulado")["202103422850"]
    assert registro["incidentes_multiplos"] is True
    assert registro["classe_completa"] == ""
    assert registro["partes"] == []
    assert registro["advogados"] == []
    assert registro["relator_pdf"] == "Min. Paulo Sérgio Domingues"


def test_pdf_reconhece_relatora(monkeypatch):
    class Pagina:
        def extract_text(self):
            return ("AgInt no RECURSO ESPECIAL Nº 2263856 - MG (2025/0357241-7)\n"
                    "RELATORA : MINISTRA REGINA HELENA COSTA\n")

    class Leitor:
        def __init__(self, arquivo):
            self.pages = [Pagina()]

    monkeypatch.setattr("stj_sessoes.pauta_client.PdfReader", Leitor)
    assert parsear_pdf_pauta(b"pdf simulado")["202503572417"]["relator_pdf"] == "Min. Regina Helena Costa"
