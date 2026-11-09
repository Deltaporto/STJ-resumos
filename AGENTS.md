# Diretrizes do Projeto: STJ-Sessões (Primeira Turma e Primeira Seção - GMHB)

Regras e princípios obrigatórios para agentes e subagentes trabalhando neste repositório.

---

## 1. Proibição Estrita de Chaves de API Pagas no Pipeline de Sessões
- **NUNCA** configurar, carregar ou repassar chaves de API pagas (`GEMINI_API_KEY`, `GOOGLE_API_KEY`) para processamento de sessões (transcrição ou resumo).
- A chave de API em `worker/.dev.vars` pertence com exclusividade ao assistente estático do portal no Cloudflare Workers e não deve ser consumida por scripts Python locais.
- O pipeline Python opera sob a arquitetura de **custo zero de API**.

---

## 2. Arquitetura em Duas Camadas para Processamento de Novas Sessões

### Camada 1: Ingestão Mecânica Determinística (Scripts Locais / Custo Zero)
- Executada via scripts locais Python e PowerShell:
  - `uv run python scripts/processar_sessoes.py --video-url "<URL>" --saneamento-rapido --apenas-transcrever`
- Responsabilidades:
  1. Baixar a pauta oficial (JSON e PDF) da API pública do Calendário do STJ;
  2. Baixar a transcrição bruta do YouTube via `yt-dlp`;
  3. Aplicar o saneamento determinístico inicial (remoção de vinhetas, filtros fonéticos e agrupamento de minutagem);
  4. Gerar os arquivos base em `data/output/` e `data/cache/`.

### Camada 2: Inteligência Jurídica e Auditoria (Subagentes Antigravity / Assinatura Google)
- Como o `gemini-cli` legado teve seu login OAuth individual descontinuado pela Google, **toda cognição jurídica** é realizada diretamente pelos **subagentes do Antigravity** (`invoke_subagent`), consumindo a cota da assinatura do Google já ativa na plataforma:
  - **Subagente de Processamento:** identifica interlocutores taquigráficos, estrutura o resumo nos 4 blocos obrigatórios (`Atuação Min. Herman Benjamin`, `Destaques`, `Processos Julgados`, `Estatísticas`), enquadra cada feito nas 15 matérias oficiais do Gabinete e gera `resumo_meta.json` e `classificacao_flash.json`.
  - **Subagente de Auditoria e Revisão:** confronta exaustivamente todos os itens da pauta oficial contra a transcrição e o resumo, checa timestamps, confere precedentes citados e assegura fidelidade estrita.

---

## 3. Integridade Taxonômica e Colegiados
- **15 Matérias Oficiais do Gabinete:** nenhum processo pode receber matéria genérica ou improvisada. Use exatamente a nomenclatura de `src/stj_sessoes/taxonomy.py`.
- **Processos em Bloco ou Adiamentos:** quando julgados em bloco ou adiados na abertura, cada processo individual deve ser discriminado no resumo e no índice preservando sua matéria material própria.
- **Ministros Titulares e Convocados:** manter `MINISTROS_TITULARES_1A_SECAO` e `GLOSSARIO_FONETICO_STJ` permanentemente atualizados (incluindo o Min. Marco Aurélio Bellizze e desembargadores convocados).
- **Protagonismo do Min. Herman Benjamin:** registrar no bloco inicial somente manifestações efetivas do Ministro durante a sessão (votos, votos-vista, apartes, condução de quórum ou declarações de suspeição/impedimento). Menções feitas por outros julgadores a precedentes históricos de Sua Excelência devem constar na fundamentação do caso específico, sem inflar artificialmente a contagem de manifestações da sessão.

---

## 4. Publicação e Testes
- Sempre validar a suíte com `uv run pytest` antes de qualquer commit.
- O script `scripts/publicar_github_pages.ps1` é o canal oficial de publicação no GitHub Pages (`Deltaporto/STJ-resumos`). Ele deve garantir o envio de quaisquer commits locais previamente criados.
