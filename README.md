# e.d.i.e

Seu assistente pessoal: um painel único para resolver o dia — agenda, tarefas e métricas do Instagram.

## Como usar

Não precisa instalar nada. Abra o `index.html` no navegador (ou publique a pasta no GitHub Pages / Netlify).
No celular, use "Adicionar à tela inicial" para ter o e.d.i.e como app.

## O que tem

| Tela | O que faz |
|---|---|
| **Hoje** | Saudação, resumo do dia, compromissos de hoje, o que falta fazer e o resumo do Instagram da semana |
| **Agenda** | Calendário mensal, criar/editar/excluir compromissos, tarefas aparecem nos dias |
| **Tarefas** | Lista com prioridade, data e categoria; filtros Hoje / Pendentes / Atrasadas / Feitas |
| **Instagram** | Seguidores, alcance, visualizações, interações, taxa de engajamento, gráficos e posts mais engajados (7 ou 30 dias) |
| **Configurações** | Seu nome, conexão com Instagram e Google Agenda, backup |

### Fale com a Edie (barra de comando)

Aperte `/` em qualquer lugar e escreva:

- `tarefa ligar pro contador amanhã urgente` → cria tarefa de prioridade alta para amanhã
- `evento reunião sexta 15h` → cria compromisso na próxima sexta às 15:00
- `dentista 10/12 às 9h30` → um horário já vira compromisso
- `agenda`, `instagram`, `tarefas` → abre a tela
- `resumo` → mostra o resumo do dia

## Conexões

**Instagram (dados reais):** a conta precisa ser Profissional (Criador ou Empresa). No
[Meta for Developers](https://developers.facebook.com/apps), crie um app com o produto
"Instagram API com login do Instagram", gere um token com as permissões
`instagram_business_basic` e `instagram_business_manage_insights` e cole em Configurações.
Sem token, a tela mostra dados de exemplo. O histórico de seguidores é montado a partir do dia em que você conecta.

**Google Agenda:**
- Importar arquivo `.ics` (Google Agenda → Configurações → Importar e exportar → Exportar), ou
- Sincronização direta de agenda **pública** com chave de API do Google Cloud (Calendar API ativada).

## Privacidade

Tudo fica salvo no navegador (localStorage). Os tokens nunca saem do seu aparelho, exceto nas chamadas diretas às APIs do Instagram/Google. O backup exportado não inclui tokens.

## Próximos passos

- Login com Google (OAuth) para ler e escrever na agenda privada
- Sincronizar entre aparelhos (backend)
- Edie com IA para responder perguntas e planejar o dia
- Notificações de compromissos
- Mais módulos: finanças, metas, hábitos
