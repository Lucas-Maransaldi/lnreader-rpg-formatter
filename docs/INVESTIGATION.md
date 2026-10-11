# Investigação do LNReader

Inspeção em **2026-10-10**, antes da implementação. Workspace inicial vazio, sem projeto ou repositório Git. Fontes oficiais clonadas apenas para leitura em `.research/` (ignorada na distribuição).

- LNReader: commit [`14d87add614960b5d1f300092339fa191399c393`](https://github.com/lnreader/lnreader/tree/14d87add614960b5d1f300092339fa191399c393), branch `master`; `package.json`/`app.json` indicam `2.1.4`. Isso identifica o código inspecionado, não a versão instalada pelo usuário nem uma release verificada.
- Snippets: commit [`4f7fb45493c2fd3efd153f229fcdc9553cb53529`](https://github.com/lnreader/snippets/tree/4f7fb45493c2fd3efd153f229fcdc9553cb53529). O clone continha apenas um README descritivo. Não havia snippets funcionais para comprovar mecanismos adicionais.

## Respostas verificadas

| Questão | Evidência e consequência |
| --- | --- |
| 1. Como carrega Custom JS? | `useCustomCode` chama `composeJS`, que concatena snippets ativos com `try/catch`. O texto vai para um script inline no HTML da WebView. [useCustomCode](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/Hooks/useCustomCode.ts), [composeJS](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/utils/customCode.ts#L28). |
| 2. Como aplica Custom CSS? | Snippets ativos são concatenados e inseridos em `<style id="ln-custom-css">` no head, além do CSS do plugin. [WebViewReader](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/WebViewReader.tsx#L373). |
| 3. Importa arquivo local? | Sim. `DocumentPicker.getDocumentAsync` usa `text/css` ou `application/javascript`; o arquivo é copiado para cache, lido e transferido ao editor. Salvar é uma ação separada. [CodeSnippetsScreen](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/settings/SettingsCustomCodeScreen/CodeSnippetsScreen.tsx#L109). |
| 4. Importa diretamente uma URL? | Não foi encontrado importador de URL na tela de Custom Code. Downloads de JS/CSS em `pluginManager` pertencem aos plugins de fontes, não à instalação de snippets do usuário. [pluginManager](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/plugins/pluginManager.ts#L142). |
| 5. Qual é a raiz? | `<div id="LNReader-chapter">`. A UI fica em outro elemento, `#reader-ui`. Usamos somente a raiz do capítulo, configurável sem varrer `body`. [HTML](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/WebViewReader.tsx#L389). |
| 6. Quando executa? | Um listener `DOMContentLoaded` chama `fn`: lê `innerHTML` para uma variável `html`, executa Custom JS e reatribui `innerHTML = html`. A inicialização do formatador usa um task adiado para ocorrer após esse retorno. [Wrapper](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/WebViewReader.tsx#L426). |
| 7. O DOM muda na navegação? | `source` é construído por capítulo e a mudança de `source` recarrega a página. Algumas alterações do leitor usam `injectJavaScript`. Cada documento precisa inicializar novamente; o observador também cobre troca/inserção de raiz e mutações no mesmo documento. [Construção de source](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/WebViewReader.tsx#L309). |
| 8. Quais recursos da WebView? | O leitor usa `react-native-webview` (`^13.16.1` no package), com `javaScriptEnabled`, `allowFileAccess` e `originWhitelist=['*']`. As APIs DOM exatas dependem do Android System WebView. Nosso target Chromium 61 é uma escolha de compilação, não uma versão mínima confirmada em dispositivo. [Props](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/WebViewReader.tsx#L455), [dependência](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/package.json). |
| 9. `fetch` e scripts externos? | Scripts de assets e do plugin são usados; isso comprova arquivos locais. Não há prova de scripts HTTPS arbitrários em todos os modos. `baseUrl` usa o site do plugin em capítulo não baixado e é indefinido em baixados. `fetch` é verificado em runtime; rede e CORS continuam dependentes da origem. [Scripts/baseUrl](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/src/screens/reader/components/WebViewReader.tsx#L318). |
| 10. CSP/CORS/execução dinâmica? | Não há CSP explícita no template inspecionado; `originWhitelist` não elimina CORS de `fetch`. Não foi demonstrada permissão universal entre origens de arquivos. Não usamos execução dinâmica nem alteramos políticas do app. Uma falha de rede deixa a cotação anterior disponível ou mostra indisponibilidade. |

O wrapper acima pode destruir alterações síncronas feitas por qualquer snippet. O formatador não modifica a variável local `html` do LNReader: retorna imediatamente e trabalha sobre os nós definitivos depois. Os testes executam os bundles dentro desse mesmo contrato, incluindo a atribuição posterior.

## Armazenamento e serviços remotos

A [referência oficial do React Native WebView](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#domstorageenabled) documenta DOM Storage habilitado por padrão no Android. Isso não garante que `localStorage` esteja utilizável na origem de cada capítulo. O modo online faz um probe de escrita/leitura/remoção dentro de `try/catch`; só então lê ou grava cotações. O modo offline não toca nesse armazenamento. Nenhum acesso ao armazenamento nativo do LNReader é presumido.

A [API Frankfurter](https://frankfurter.dev/) oferece dados de câmbio e filtro por provedor. Foi escolhido o endpoint ECB com base USD e quotes KRW/EUR, uma requisição para ambas as moedas. A resposta foi acessível via HTTPS neste ambiente de desenvolvimento e trouxe `date`, `base`, `quote` e `rate`; nenhuma dessas cotações foi gravada como padrão. As taxas são invertidas para USD por unidade. Não foi realizado teste Android/CORS, portanto o recurso é opt-in.

Não foi criado loader remoto: o suporte necessário não foi comprovado. [Decisão e requisitos futuros](../loader/README.md).

## Interação e posição de leitura

O leitor instala `document.onclick` para áreas de toque e controles, e listeners `touchstart/move/end` no capítulo para gestos. [core.js](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/assets/reader/js/core.js#L863). O formatador intercepta somente cliques consumidos por conversão/diálogo na fase de captura, sem cancelar eventos touch nem seleção.

O modo paginado usa colunas CSS e transforma `#LNReader-chapter`. [pageReader.css](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/assets/reader/css/pageReader.css). Agrupar com um wrapper adicional poderia afetar colunas e TTS; por isso a versão inicial mantém os blocos no lugar e usa classes em irmãos. Em colunas, mantém padding/margens originais.

O host restaura progresso com cálculo de altura e callbacks assíncronos para fontes/imagens. [Restauração](https://github.com/lnreader/lnreader/blob/14d87add614960b5d1f300092339fa191399c393/assets/reader/js/core.js#L722). Compensamos o primeiro parágrafo visível nas alterações próprias em rolagem, sem chamar APIs internas do host. A interação real com restauração entre sessões, imagens tardias, TTS e eventos nativos ainda requer testes em aparelho.

## Limites da evidência

Código-fonte confirma mecanismos; testes Chromium confirmam a implementação em DOM/Web APIs desktop. Nenhum APK foi alterado, compilado, instalado ou executado nesta sessão. Não se afirma compatibilidade verificada em todas as versões do LNReader/Android, nem publicação GitHub já concluída.
