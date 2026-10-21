# Assistente de IA do Caderno de Sessões — proxy (Cloudflare Worker)

O portal publicado no GitHub Pages é estático e público. Por isso a chave do Gemini **não pode** ficar nele.
Este proxy roda no Cloudflare Workers, guarda a chave e os códigos de acesso da equipe e conversa com o Gemini
em nome do portal.

```
Navegador (portal)  ──pergunta + código──▶  Proxy (Cloudflare)  ──material + pergunta──▶  Gemini 3.8 Flash
                    ◀──resposta em fluxo──                       ◀──────resposta──────────
                                              │
                                              └── lê o material publicado em web/assistente/
```

- O navegador envia só a pergunta, o escopo escolhido e o histórico da conversa. O material das sessões é lido
  pelo proxy direto do portal publicado (`web/assistente/`), então ninguém consegue usar o proxy para outros fins.
- O build (`scripts/gerar_site.py`) gera `web/assistente/indice.json` e um `.txt` por sessão (resumo, pauta e
  transcrição), já no formato que vai para o modelo.

## Como o assistente escolhe o que ler

| Escopo no painel | O que o modelo lê |
|---|---|
| Esta sessão | Resumo, pauta e transcrição completa da sessão aberta (~72–85 mil tokens) |
| 1ª Turma, 1ª Seção ou Todas | Se couber em `ORCAMENTO_CARACTERES` (padrão 600 mil caracteres ≈ 165 mil tokens), tudo na íntegra |
| Escopo maior que o orçamento | Primeiro o modelo lê o índice de todas as sessões (processos, resultados, teses, pauta) e escolhe até 3 para ler na íntegra; a resposta usa o índice e essas sessões |

O filtro de matéria limita as sessões consultadas às que têm processos daquela matéria.

As respostas citam a minutagem no formato `[[id_da_sessao@HH:MM:SS]]`; o portal converte em links para o minuto
exato do vídeo.

## 1. Testar no seu computador

Requisitos: Node.js 20 ou mais recente.

```bash
cd worker
npm install
```

Sem chave, com respostas simuladas (para ver a interface):

```bash
npm run local:simulado
```

Abra http://localhost:8791 e use o código `codigo-local-123`.

Com o Gemini de verdade: copie `.dev.vars.exemplo` para `.dev.vars`, preencha `GEMINI_API_KEY` e
`CODIGOS_ACESSO` e rode:

```bash
npm run local
```

`.dev.vars` está no `.gitignore` e nunca vai para o GitHub.

## 2. Publicar o proxy (uma vez)

1. Crie uma conta gratuita em https://dash.cloudflare.com.
2. Entre pelo terminal (abre o navegador para autorizar):

   ```bash
   npx wrangler login
   ```

3. Publique:

   ```bash
   npx wrangler deploy
   ```

   O comando mostra o endereço do proxy, algo como `https://stj-assistente.SEU-SUBDOMINIO.workers.dev`.

4. Envie os segredos a partir do seu `.dev.vars`:

   ```bash
   npx wrangler secret bulk .dev.vars
   ```

5. Confira: abrir `https://stj-assistente.SEU-SUBDOMINIO.workers.dev/api/saude` deve mostrar `{"ok":true,...}`.

## 3. Ligar o portal ao proxy

Em `web/assistente-config.js`, coloque o endereço do passo 2:

```js
window.ASSISTENTE_CONFIG = { apiUrl: 'https://stj-assistente.SEU-SUBDOMINIO.workers.dev' };
```

Depois publique o portal normalmente (`pwsh -File scripts/publicar_github_pages.ps1`). O botão **Assistente**
aparece na barra superior. Enquanto `apiUrl` estiver vazio, o botão fica oculto.

## Códigos de acesso da equipe

**Situação atual (21/10/2026): código desligado.** Em `wrangler.toml`, `EXIGIR_CODIGO = "nao"` libera o assistente
para qualquer visitante do portal, apenas com o limite de 20 requisições por minuto por endereço IP. O código
(`IAGMHB`) continua guardado no Cloudflare.

Para religar, se notar gasto excessivo:

1. Em `wrangler.toml`, troque para `EXIGIR_CODIGO = "sim"`.
2. Rode `npx wrangler deploy` na pasta `worker`.

Não é preciso republicar o portal: o painel pede o código sozinho quando o proxy passa a exigi-lo.

Com o código desligado, o que limita o gasto é o teto configurado em https://ai.studio/spend. Mantenha esse
teto ajustado ao orçamento.

`CODIGOS_ACESSO` aceita vários códigos no formato `nome:codigo`, separados por vírgula (mínimo de 6 caracteres
cada). O nome aparece nos logs do Cloudflare e permite revogar o código de uma pessoa sem afetar as outras.
Para trocar a lista:

```bash
npx wrangler secret put CODIGOS_ACESSO
```

Cada pessoa digita o código uma vez; ele fica salvo só no navegador dela ("Trocar código" no rodapé do painel).

## Custos, limites e privacidade

- **Gemini:** cada pergunta sobre uma sessão envia ~72–85 mil tokens de entrada; perguntas sobre várias sessões,
  até ~250 mil. Perguntas seguidas sobre o mesmo material aproveitam o cache implícito do Gemini, que é mais barato
  (no teste, 96% da entrada da segunda pergunta veio do cache). O cache não é garantido: às vezes a mesma pergunta
  repetida minutos depois não o aproveita. Configure um limite de gastos e alertas no Google AI Studio; quando o
  limite é atingido, o painel avisa que é preciso aumentá-lo em ai.studio/spend.

Tempos medidos em 21/10/2026 (raciocínio `low`, teste local):

| Situação | Primeira palavra | Resposta completa |
|---|---|---|
| Primeira pergunta sobre uma sessão | ~3 s | ~9 s |
| Pergunta seguinte na mesma conversa (com cache) | ~2 s | ~7 s |
| Todas as sessões (com escolha de sessões, ~180 mil tokens) | ~10 s | ~18 s |

Com raciocínio `medium` (padrão do modelo), a primeira pergunta sobre uma sessão levou ~16 s até a primeira palavra,
com conteúdo equivalente. Por isso o padrão aqui é `low`.

Para repetir o teste com o Gemini de verdade (a chave e o código nunca são exibidos):

```bash
npm run teste:real
npm run teste:real -- --todas --pergunta "Sua pergunta"
npm run teste:real -- --raciocinio medium --seguimento "Pergunta seguinte"
```
- **Use uma chave com faturamento ativo.** No nível gratuito da API do Gemini, o Google pode usar o conteúdo das
  requisições para melhorar seus produtos; no nível pago, não. O material das sessões já é público, mas as
  perguntas da equipe não.
- **Cloudflare:** o plano gratuito permite 100 mil requisições por dia, mas limita o tempo de CPU a 10 ms por
  requisição. O proxy só junta textos, mas com o material atual a estimativa fica entre 10 e 30 ms. Se aparecer
  o erro 1102 ("Worker exceeded resource limits"), ative o plano Workers Paid (US$ 5/mês).
- **Limite de uso:** 20 requisições por minuto por pessoa e por endereço IP (`[[ratelimits]]` em `wrangler.toml`).
- **Logs:** o proxy registra quem perguntou, o escopo e os tokens usados, mas não o texto das perguntas. Veja em
  Cloudflare → Workers → stj-assistente → Logs.

## O que o usuário vê quando um limite é atingido

O painel mostra um aviso com título, explicação e, quando faz sentido, o botão "Tentar de novo" com contagem
regressiva. Amarelo indica que basta aguardar; vermelho indica que depende do administrador ou da rede.

| Aviso no painel | Causa | O que fazer |
|---|---|---|
| **Aguarde um pouco**: "Muitas perguntas foram enviadas desta rede no último minuto (o limite é 20 por minuto)" | Limite do proxy por endereço IP (`[[ratelimits]]`) | O usuário espera 60 s. Se for frequente, aumente `limit` em `wrangler.toml` |
| **Aguarde um pouco**: "O serviço de IA recebeu muitas perguntas ao mesmo tempo" | Cota por minuto do Gemini (contagem usa o tempo que o Google informa) | O usuário espera. Se for frequente, veja as cotas do projeto no AI Studio |
| **Serviço instável** | Erro 5xx do Gemini | O usuário tenta de novo após 20 s |
| **Limite de hoje atingido** | Cota diária do Gemini | Volta no dia seguinte (o Google zera à meia-noite do Pacífico, ~4h–5h em Brasília) |
| **Assistente pausado**: "limite de gastos do mês" | Teto de gastos do projeto no AI Studio | Aumente o teto em https://ai.studio/spend |
| **Assistente indisponível**: "problema de configuração" | Chave inválida, modelo inexistente ou material do portal não encontrado | Veja o detalhe em Cloudflare → Workers → stj-assistente → Logs |
| **Assistente fora do ar** | O proxy não respondeu: fora do ar, limite diário do Cloudflare (100 mil requisições no plano gratuito) ou limite de CPU (erro 1102) | Veja o painel do Cloudflare; se for limite, considere o plano Workers Paid |
| **Sem conexão** | O computador do usuário está sem internet | O usuário verifica a rede |
| **Conversa longa demais** | Histórico acima do limite do proxy | O botão "Começar nova conversa" mantém a pergunta na caixa |

Para ver cada aviso no simulador local (`npm run local:simulado`), escreva na pergunta `#simular:limite_ia`,
`#simular:limite_diario`, `#simular:limite_gastos` ou `#simular:instavel`.

## Ajustes (wrangler.toml → [vars])

| Variável | Padrão | Para quê |
|---|---|---|
| `GEMINI_MODELO` | `gemini-3.8-flash` | Modelo usado nas respostas |
| `GEMINI_NIVEL_RACIOCINIO` | `low` | `low` responde mais rápido e mais barato; `medium` ou `high` raciocinam mais antes de responder |
| `ORCAMENTO_CARACTERES` | `600000` | Até quanto material vai na íntegra antes de o assistente escolher sessões |
| `MAX_SESSOES_COMPLETAS` | `3` | Máximo de sessões lidas na íntegra quando o escopo é grande |
| `ORIGENS_PERMITIDAS` | GitHub Pages + localhost | Sites autorizados a chamar o proxy |
| `EXIGIR_CODIGO` | `nao` | `sim` exige o código de acesso; `nao` libera para qualquer visitante |

Depois de mudar, rode `npx wrangler deploy` de novo.

## Testes

```bash
npm test
```

## Observação técnica

O proxy usa a API `generateContent` do Gemini (REST, com streaming). O Google recomenda a nova Interactions API
para projetos novos, mas mantém a `generateContent` "totalmente suportada". Além disso, ela não guarda as conversas
no servidor do Google por padrão. Toda a comunicação com o Gemini está em `src/gemini.js`; para migrar, basta
trocar esse arquivo.
