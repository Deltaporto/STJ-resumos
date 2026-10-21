# STJ Sessões — Primeira Turma e Primeira Seção (GMHB)

Sistema nativo para Windows (Python 3.13+ e PowerShell) destinado à captura, saneamento de transcrições, sumarização jurídica e publicação estática das sessões de julgamento da **Primeira Turma** e da **Primeira Seção** do Superior Tribunal de Justiça (STJ).

## Escopo e Características

1. **Recorte Exclusivo de Direito Público**: processa exclusivamente sessões da **Primeira Turma** e da **Primeira Seção** transmitidas no canal oficial `@STJnoticias`.
2. **Protagonismo das Manifestações do Min. Herman Benjamin**: identifica e destaca, no topo de cada sessão e em cada processo, todos os votos, relatorias, votos-vista, apartes e debates do Ministro Herman Benjamin, com minutagem direta para o vídeo.
3. **Classificação pelas 15 Matérias do Gabinete**:
   - `1. Improbidade Administrativa`
   - `2. Desapropriação / Intervenção do Estado`
   - `3. Reforma Agrária`
   - `4. Servidor Público Civil e Militar`
   - `5. Atos Administrativos`
   - `6. Licitações e Contratos`
   - `7. Responsabilidade Civil da Administração`
   - `8. Direito Tributário`
   - `9. Poder de Polícia (Exceto Ambiental)`
   - `10. Ação Civil Pública`
   - `11. Direito Previdenciário`
   - `12. Direito Ambiental Urbanístico`
   - `13. Direito dos Povos Indígenas`
   - `14. Saúde Pública`
   - `15. Direito do Consumidor`
4. **Classificação de Julgadores com Categoria Flexível**: normaliza os nomes dos Ministros titulares da 1ª Turma e da 1ª Seção e classifica automaticamente na categoria flexível `Desembargadores Convocados / Substitutos` eventuais magistrados convocados ou substitutos atuantes no colegiado.
5. **Transcrição Revisada e Saneada para Download Público**: remove vinhetas institucionais prévias à abertura da sessão, corrige erros fonéticos de reconhecimento de voz, organiza os blocos por minutagem (`[HH:MM:SS]`) e disponibiliza o arquivo `.md` para download direto e leitura na própria página.

6. **Assistente de IA (Gemini 3.8 Flash) restrito à equipe**: painel "Assistente" no portal para perguntas em linguagem natural sobre a sessão aberta, um órgão ou todas as sessões, com filtro por matéria e links para o minuto exato do vídeo. A chave do Gemini fica num proxy no Cloudflare Workers (`worker/`), protegido por códigos de acesso. Instalação e publicação em [worker/README.md](worker/README.md).

## Comandos Principais (PowerShell)

### 1. Instalar ou sincronizar ambiente virtual
```powershell
uv sync --extra dev
```

### 2. Processar sessões recentes da 1ª Turma e 1ª Seção
```powershell
uv run python scripts/processar_sessoes.py --orgao todos --max-videos 5
```

### 3. Processar uma sessão específica por URL do YouTube
```powershell
uv run python scripts/processar_sessoes.py --video-url "https://www.youtube.com/watch?v=ID_DO_VIDEO"
```

### 4. Recompilar `web/data.js`, `web/transcricoes/` e `web/assistente/`
```powershell
uv run python scripts/gerar_site.py
```

### 5. Publicar no GitHub Pages (`Deltaporto/STJ-resumos`)
```powershell
pwsh -File scripts/publicar_github_pages.ps1
```
