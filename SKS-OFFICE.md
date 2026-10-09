# SKS Office — fork do pixel-agents

Fork do [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT) para ver as sessões do Claude Code
como personagens num escritório pixel-art, no navegador, em localhost.

## Como rodar (Windows)

Requer Node.js 20+.

```bash
npm ci
npm run build
node dist/cli.js --port 3100
```

O servidor imprime uma URL com `?token=...`. Abra-a no navegador. O token é um segredo local: sem ele a página só
observa e não consegue alterar o `~/.claude/settings.json`. Ele muda a cada reinício.

Em Settings, ligue **Watch All Sessions** para enxergar as sessões de qualquer pasta, e não só a do diretório atual.

## O que mudou em relação ao original

- **Uma sala por projeto.** Uma pasta vista pela primeira vez ocupa a primeira Area livre que tenha cadeira, e o vínculo
  fica salvo em `~/.pixel-agents/config.json` (`areaMappings`). Quem sobra nunca senta na sala de outro projeto.
  As Areas são pintadas no editor de layout. O layout `default-layout-2.json` traz três.
- **Nome da pasta correto.** Vem do `cwd` real gravado no transcrito, e não do caminho codificado, que cortava
  `reclassificacao-dre` em `dre`.
- **Métricas por agente.** Tokens e tempo ativo, na linha do painel do agente (detalhe no tooltip).
  - Tokens = entrada (nova + criação de cache) + saída. Leituras de cache ficam fora do total e aparecem à parte.
  - Os totais cobrem a sessão inteira: o transcrito é relido uma vez ao adotar o agente, depois só soma o que chega.
    Mensagens repetidas no transcrito são contadas uma vez, por `message.id`.
  - Tempo ativo é aproximado: soma os intervalos entre registros e descarta pausas maiores que 3 minutos.

Arquivos novos: `webview-ui/src/office/engine/areaAssignment.ts`, `formatMetrics.ts`, `server/src/folderName.ts`,
`server/src/sessionMetrics.ts`, a mensagem `agentMetrics` em `core/asyncapi.yaml` (e o `core/src/messages.ts` gerado).

## Hooks

Os hooks dão detecção instantânea (permissões, fim de turno), mas escrevem no `~/.claude/settings.json`. O app só faz
isso depois de um consentimento na interface e guarda uma cópia em `settings.json.pixel-agents.backup`.
Para remover: Settings → Instant Detection (Hooks).

## Testes

```bash
cd webview-ui && npm test                                   # interface
cd server && npx vitest run __tests__/folderName.test.ts __tests__/sessionMetrics.test.ts
npm run check-types && npm run lint
```

**Cuidado no Windows com a suíte completa do servidor** (`cd server && npm test`). Ela simula o diretório pessoal com a
variável `HOME`, mas o Node no Windows lê `USERPROFILE`. Resultado: ela escreve no seu `~/.pixel-agents` real (já
sobrescreveu `areaMappings`) e muitos testes falham por encontrar a sua config. Se precisar rodá-la, aponte as duas
variáveis para uma pasta temporária antes:

```powershell
$t = Join-Path $env:TEMP "pa-home"; New-Item -ItemType Directory -Force $t | Out-Null
$env:USERPROFILE = $t; $env:HOME = $t
```

## Pendente

- Arte própria (personagens, móveis, piso): ainda são os sprites do upstream.
- Chave das salas pelo nome curto da pasta: duas pastas com o mesmo nome em lugares diferentes dividem a sala.
