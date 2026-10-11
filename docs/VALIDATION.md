# Validação — v0.2.0

Executado em 2026-10-10, Windows, Node.js 24.19.0. Dependências exatas em `package-lock.json`; navegador Chromium instalado pelo Playwright. O alvo de compilação Chromium 61 não foi executado diretamente.

## Resultado automatizado

`npm run check` passou: TypeScript, **125 testes unitários/DOM**, build e **11 testes Chromium**. Os bundles legível e minificado foram executados independentemente. Capturas reais do preview em `docs/images/`.

| Área | Evidência |
| --- | --- |
| Sistema | Notificações, atributos, equipamentos, habilidades, quests, recusas de narrativa/colchetes desconhecidos. |
| Agrupamento | Apenas irmãos consecutivos do mesmo tipo; não cruza prosa, BR nem outros elementos. Mesmos nós de parágrafo. |
| Raridades | Sete raridades em campos/cabeçalhos; nomes seguros e contexto narrativo; recusa de habilidades, classes, títulos, negações simples, campos conflitantes/desconhecidos; novos nomes/cabeçalhos delimitam itens. |
| Perfis | Aliases e raridades próprias, campos/substantivos substituíveis, cores por perfil/tema, troca de perfil, configuração isolada e desativação reversível. |
| Integração monetária | Itens com preços e moedas no próprio nome, inclusive após edição da raridade; spans monetários mantêm cor, identidade e interação. |
| Moedas | Três fictícias sem conversão/role interativo; KRW/EUR conversíveis, USD somente destaque; milhares, milhões e bilhões; formatos ambíguos rejeitados. |
| Preservação | Igualdade de `textContent`, seleção/Range igual ao original, mesma identidade de tags internas e listeners preservados. Links, código, UI e editáveis ignorados. |
| Ciclo de vida | Inicialização repetida, um style/API, nenhuma temporização em loop, raiz tardia/substituída, conteúdo acrescentado, moeda editada, desativação/remoção. |
| Host | Reproduz `DOMContentLoaded → html local → Custom JS → innerHTML = html`; controle `document.onclick` não recebe cliques de conversão, mas recebe cliques normais. |
| Pop-up | Sem taxa inventada; aritmética com taxa sintética explicitamente de teste; origem/data; uma instância; fecha por botão, fora e Escape; teclado e foco. |
| Temas | Três temas, fundo claro/escuro e screenshots. Cores de raridade distintas, bordas correspondentes, overrides por CSS/perfil e contraste de texto padrão ≥ 4,5:1 nas superfícies testadas. Diálogo cabe em viewport de 320 × 568. |
| Posição | Parágrafo no topo da área visível mantém coordenada após aplicar formatação no meio do capítulo; geometria de parágrafo preservada em colunas simuladas. |
| Rede | Bundles offline, zero requisições no modo padrão; provedor mockado com deduplicação, cache, erro de rede/storage, validação/inversão de taxas e prioridade manual. |
| Distribuição | IIFEs sem runtime externo; ausência de `eval`, `new Function` e fechamento literal de script; assets e SHA-256 gerados. |

As respostas de câmbio dos testes são sintéticas e não representam cotações para uso. O endpoint real foi consultado apenas como investigação; testes de CI não dependem dele.

## Ainda não validado no Android

Use esta sequência no dispositivo com sua versão real do LNReader:

1. Importar o arquivo local, salvar/ativar, fechar e reabrir um capítulo. Se o MIME impedir seleção, testar copiar/colar.
2. Conferir janelas, texto, moedas e raridades em capítulos reais de Overgeared da fonte utilizada. Repetir com outra novel LitRPG e seu perfil de vocabulário. Nomes sem rótulo e associações indiretas são ignorados por projeto.
3. Abrir/fechar KRW/EUR, rolar iniciando o gesto sobre um valor, usar botões nativos, avançar/voltar e alternar capítulos baixados/online.
4. Selecionar/copiar várias linhas passando por uma moeda; testar busca, TTS, menus de seleção e customizações existentes.
5. Testar os três temas, fontes ampliadas, claro/escuro, orientação, leitura vertical e horizontal/paginada.
6. Retomar progresso salvo, inclusive após fontes/imagens carregarem e após alternar o tema.
7. Ativar modo avião e reabrir capítulos baixados: detecção, temas e taxas manuais devem continuar disponíveis.
8. Opcional: ativar `onlineRates`, verificar cotação/data e depois modo avião. Se o cache não sobreviver à troca de origem, usar taxas manuais.
9. Atualizar substituindo o snippet, depois importar a versão anterior para verificar rollback.

Não há loader remoto nesta versão: testes de falha de um loader são **não aplicáveis**, não foram registrados como aprovados. Os resultados das execuções de CI e publicação remota ficam em [GitHub Actions](https://github.com/Lucas-Maransaldi/lnreader-rpg-formatter/actions).
