# Decisão: sem loader remoto na v0.1.0

O código inspecionado do LNReader carrega scripts de assets e do diretório local de plugins.
Isso confirma suporte a `script src` local, mas não comprova carregamento HTTPS via jsDelivr
em todos os contextos de capítulos baixados, origens e versões do Android WebView.
A tela de Custom Code importa um arquivo pelo seletor do Android; não foi encontrado um
importador de URL nessa tela. Não existe `lnreader-loader.js` nesta versão.

A instalação oficial é importar `dist/lnreader-rpg.js` ou `.min.js`, que inclui os estilos
e funciona offline. Baixar uma release pelo navegador e importar o arquivo é distribuição
remota com instalação local; não é atualização automática.

Um futuro loader exige teste em dispositivo (capítulo online e baixado), origem do próprio
repositório e versão fixada, timeout, erro visível sem interromper a leitura, deduplicação
e alternativa local. A URL conceitual seria
`https://cdn.jsdelivr.net/gh/OWNER/REPOSITORY@v0.1.0/dist/lnreader-rpg.min.js`.
OWNER/REPOSITORY são placeholders, não uma publicação existente.

Os testes de distribuição atuais bloqueiam a rede e confirmam que os bundles não fazem
requisições remotas. Falha de loader remoto não é um teste aplicável enquanto ele não existir;
falhas de rede do provedor opcional de câmbio são testadas.

Evidências e limites: [investigação](../docs/INVESTIGATION.md).
