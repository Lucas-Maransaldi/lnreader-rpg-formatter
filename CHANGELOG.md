# Changelog

Versionamento semântico. O projeto é independente do LNReader.

## 0.2.0 — 2026-10-10

- Detecção de Common, Uncommon, Rare, Epic, Unique, Legendary e Mythic, com campos explícitos, cabeçalhos de equipamento e contexto narrativo conservador.
- Borda por raridade e destaque de nomes seguros, cabeçalhos e valores, sem alterar o texto ou mover os parágrafos.
- Perfis com aliases, rótulos, substantivos e cores próprios, incluindo novas raridades sem presumir hierarquia.
- Variáveis CSS de raridade nos três temas; tons adaptados para Minimal claro e contraste dos termos verificado em navegador.
- Evidência explícita prioritária, abstenção em campos conflitantes/desconhecidos e rejeição de habilidades, títulos e classes.
- Delimitação de itens consecutivos por nome/cabeçalho; atributos de equipamento permanecem no grupo do item.
- Utilitários de intervalos de texto compartilhados com moedas, preservando HTML aninhado, valores monetários, seleção e idempotência.
- Preview e capturas atualizados; cobertura total de 125 testes unitários/DOM e 11 testes Chromium.

## 0.1.0 — 2026-10-10

- Primeira distribuição autônoma para Custom JS, com CSS incorporado e separado.
- Detectores conservadores de notificações, status, itens, habilidades e quests em inglês.
- Agrupamento visual de parágrafos consecutivos, sem reparentear o conteúdo.
- Temas Classic RPG, Medieval Fantasy e Minimal, com adaptação ao fundo do leitor.
- Gold, Silver e Copper recebem somente destaque. USD não abre conversão.
- KRW/EUR abrem um diálogo de conversão; nenhuma taxa é fornecida por padrão.
- Taxas manuais e integração opcional Frankfurter/ECB com cache após teste de disponibilidade.
- Inicialização adiada para sobreviver à reatribuição de HTML do Custom JS do LNReader.
- Observação de capítulos, proteção de seleção, inicialização idempotente e remoção reversível.
- Testes unitários, testes Chromium offline, demonstração, imagens, checksums e workflows de release.
- Instalação remota automática adiada até comprovação em Android WebView.
