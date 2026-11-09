---
name: processar-sessao-stj
description: Fluxo operacional de ponta a ponta para capturar, sanear, resumir, auditar e publicar novas sessões de julgamento da Primeira Turma ou Primeira Seção do STJ no portal GMHB.
---

# Workflow: Processamento de Sessões do STJ (Primeira Turma e Primeira Seção)

Este workflow descreve o procedimento operacional padrão para ingestão, processamento, auditoria e publicação de sessões de julgamento do STJ no portal GMHB, utilizando exclusivamente a cota da assinatura do Google via subagentes do Antigravity (custo zero de API paga).

---

## 1. Identificação da Nova Sessão

1. Consultar as sessões recentes do canal oficial `@STJnoticias` no YouTube:
   ```powershell
   uv run python -c "from stj_sessoes.youtube_client import YouTubeClient; yt = YouTubeClient(); print([(v.title, v.upload_date, v.orgao, v.video_id) for v in yt.listar_sessoes_canal(max_resultados=5)])"
   ```
2. Confrontar com `data/output/index.json` para confirmar se o `video_id` é inédito.

---

## 2. Passo 1: Ingestão Mecânica Determinística

Executar a captura determinística da pauta e das legendas sem chamadas de IA:
```powershell
uv run python scripts/processar_sessoes.py --video-url "https://www.youtube.com/watch?v=VIDEO_ID" --saneamento-rapido --apenas-transcrever
```
Isso gera:
- `data/cache/pautas/YYYY-MM-DD_<orgao>_pauta.json` e PDF oficial;
- `data/cache/youtube/<VIDEO_ID>_transcricao_bruta.json`;
- `data/output/<orgao>/YYYY-MM-DD_<orgao>_<VIDEO_ID>_transcricao_bruta.md`;
- `data/output/<orgao>/YYYY-MM-DD_<orgao>_<VIDEO_ID>_pauta.json`, `.md` e `.pdf`.

---

## 3. Passo 2: Disparo do Subagente de Processamento (Assinatura Google)

Disparar o primeiro subagente (`invoke_subagent` com `TypeName='self'`) encarregado da camada cognitiva:
1. **Revisão Taquigráfica com Interlocutores:**
   - Analisar a transcrição bruta e a pauta oficial.
   - Gerar `YYYY-MM-DD_<orgao>_<VIDEO_ID>_transcricao_revisada.md` identificando Presidente, Relatores, Vogais, Procuradores e Advogados em sustentação oral, preservando timestamps `[HH:MM:SS]`.
   - Exportar o arquivo Word `.docx` correspondente via `stj_sessoes.docx_exporter.exportar_transcricao_para_docx`.
2. **Sumarização Jurídica Estruturada:**
   - Gerar `YYYY-MM-DD_<orgao>_<VIDEO_ID>_resumo.md` e `_resumo_bruto.md` com as 4 seções obrigatórias:
     - `## Atuação e Manifestações do Min. Herman Benjamin`
     - `## Destaques da Sessão`
     - `## Processos Julgados` (discriminando todos os itens apreciados, matérias 1-15, relatores, resultados de ata, relevância, teses e resumo da discussão)
     - `## Estatísticas`
3. **Metadados e Classificação Flash:**
   - Gerar `resumo_meta.json` e `classificacao_flash.json`.
4. **Atualização de Índice e Build Inicial:**
   - Atualizar `data/output/index.json`.
   - Executar `uv run python scripts/gerar_site.py`.

---

## 4. Passo 3: Disparo do Subagente Revisor e Auditor Jurídico

Disparar o segundo subagente (`invoke_subagent` com `TypeName='self'`) para auditoria independente:
1. **Auditoria da Pauta:** conferir número por número, classe e relator contra o JSON oficial da pauta do STJ.
2. **Conferência de Timestamps:** verificar se o início `(Início: [HH:MM:SS])` de cada julgado coincide com o áudio/transcrição.
3. **Classificação Taxonômica:** assegurar que 100% dos processos usem códigos oficiais das 15 matérias e que os magistrados estejam classificados como titulares ou substitutos.
4. **Saneamento e Ajustes Diretos:** corrigir erros fonéticos remanescentes, atualizar o Word `.docx` e os metadados.
5. **Verificação de Testes:** rodar `uv run pytest`.

---

## 5. Passo 4: Consolidação e Publicação

Após a conclusão da auditoria:
1. Compilar dados do portal:
   ```powershell
   uv run python scripts/gerar_site.py
   ```
2. Rodar a suíte de testes:
   ```powershell
   uv run pytest
   ```
3. Fazer commit e push no repositório do código:
   ```powershell
   git add -A
   git commit -m "feat(sessao): incluir sessao da <Orgao> de DD/MM/YYYY"
   git push origin source
   ```
4. Publicar no GitHub Pages:
   ```powershell
   pwsh -File scripts/publicar_github_pages.ps1
   ```
