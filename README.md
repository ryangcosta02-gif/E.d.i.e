# e.d.i.e

Seu assistente pessoal: um painel único para resolver o dia — agenda, tarefas, métricas do Instagram e uma assistente que conversa com você **por voz**.

Visual: fundo preto com destaques em laranja e azul.

## Como usar

Não precisa instalar nada. Abra o `index.html` no navegador (ou publique a pasta no GitHub Pages / Netlify).
No celular, use "Adicionar à tela inicial" para ter o e.d.i.e como app.

## O que tem

| Tela | O que faz |
|---|---|
| **Hoje** | Saudação, resumo do dia, compromissos de hoje, o que falta fazer e o resumo do Instagram da semana. Botão "Edie, me fala do meu dia" lê o resumo em voz alta |
| **Fale com a Edie** | Conversa por voz: toque no orbe (ou `Ctrl+Espaço`), fale, e a Edie responde falando. Modo mãos livres continua ouvindo depois de cada resposta |
| **Agenda** | Calendário mensal, criar/editar/excluir compromissos, tarefas aparecem nos dias |
| **Tarefas** | Lista com prioridade, data e categoria; filtros Hoje / Pendentes / Atrasadas / Feitas |
| **Instagram** | Seguidores, alcance, visualizações, interações, taxa de engajamento, gráficos e posts mais engajados (7 ou 30 dias) |
| **Configurações** | Seu nome, conexão com Instagram e Google Agenda, backup |

### Fale com a Edie (voz ou texto)

- **Falar:** toque no microfone (barra do topo ou tela "Fale com a Edie") ou aperte `Ctrl+Espaço`. Funciona no Chrome, Edge e Safari (precisa permitir o microfone).
- **Ouvir:** a Edie responde com a voz do sistema em português. Escolha a voz, velocidade e tom em Configurações → Voz da Edie.
- **Escrever:** aperte `/` em qualquer lugar.

Exemplos:

- `tarefa ligar pro contador amanhã urgente` → cria tarefa de prioridade alta para amanhã
- `evento reunião sexta 15h` → cria compromisso na próxima sexta às 15:00
- `dentista 10/12 às 9h30` → um horário já vira compromisso
- `o que eu tenho amanhã?`, `qual meu próximo compromisso?`
- `o que falta fazer?`, `terminei gravar reels`
- `como está meu Instagram?`
- `abrir agenda`, `ver instagram`

### Dois níveis de inteligência

- **Básica (padrão, grátis):** entende os comandos acima direto no navegador.
- **Claude (conversa livre):** cole uma chave da API do Claude em Configurações → Inteligência da Edie. Aí ela conversa sobre qualquer assunto, entende o que você fala do seu jeito, e cria/conclui tarefas e compromissos por você. A chave fica só no seu navegador e é enviada apenas para a API da Anthropic. O SDK oficial está em `vendor/anthropic-sdk.js` (empacotado de `@anthropic-ai/sdk@1.0.0`) para funcionar abrindo o arquivo direto.

## Conexões

**Instagram (dados reais):** a conta precisa ser Profissional (Criador ou Empresa). No
[Meta for Developers](https://developers.facebook.com/apps), crie um app com o produto
"Instagram API com login do Instagram", gere um token com as permissões
`instagram_business_basic` e `instagram_business_manage_insights` e cole em Configurações.
Sem token, a tela mostra dados de exemplo. O histórico de seguidores é montado a partir do dia em que você conecta.

**Google Agenda:**
- Importar arquivo `.ics` (Google Agenda → Configurações → Importar e exportar → Exportar), ou
- Sincronização direta de agenda **pública** com chave de API do Google Cloud (Calendar API ativada).

## Versão dentro do claude.ai

Há uma segunda versão da Edie que roda dentro do claude.ai e usa o **seu próprio plano do Claude** como cérebro (sem chave de API e sem custo extra; o uso conta nos limites do plano). Agenda, tarefas e conversa ficam salvas numa área privada da sua conta, iguais no celular e no computador.

Diferenças: lá dentro o microfone não é liberado (você escreve e ela responde com voz). O Instagram vem do **Metricool** conectado na conta do claude.ai (seguidores, alcance, visualizações, interações e posts dos últimos 60 dias); as fotos dos posts não aparecem porque o claude.ai bloqueia imagens de outros sites.

Ela é gerada a partir do mesmo código do app: depois de mudar `index.html`, `styles.css` ou `app.js`, rode `python3 tools/build_claude_page.py` para atualizar `claude-ai/edie.html`.

## Privacidade

Tudo fica salvo no navegador (localStorage). Os tokens nunca saem do seu aparelho, exceto nas chamadas diretas às APIs do Instagram/Google. O backup exportado não inclui tokens.

## Próximos passos

- Login com Google (OAuth) para ler e escrever na agenda privada
- Sincronizar entre aparelhos (backend)
- Edie avisar por voz antes dos compromissos
- Palavra de ativação ("Edie…") sem precisar tocar
- Notificações de compromissos
- Mais módulos: finanças, metas, hábitos
