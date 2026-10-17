# CLAUDE.md — 8 - Buffer Control (Plataforma MMT)

Autor/dono: Guilherme da Costa Fernandes · MMT / MES Key User · TPV Vision Manaus

## Regra nº 1 — mudar SÓ o que for pedido
- Altere apenas o que o pedido descreve. Não refatore, não renomeie, não "melhore" outras partes por conta própria.
- Não mude textos, cores, layout, nomes de campos ou arquivos de dados que não fazem parte do pedido.
- Se achar um problema fora do escopo, **avise** na resposta. Não corrija sem autorização.
- Em dúvida sobre regra de negócio, pergunte antes de implementar.
- Antes de entregar, teste o fluxo afetado e diga exatamente o que foi e o que não foi testado.

## Objetivo do sistema
Controlar a entrada e a saída de magazines (racks condutivos com placas SMD) na **sala de buffer** entre o SMT e a IM:
- Leitura de etiqueta (OP + LPN + quantidade) na entrada e na saída.
- Cruzamento da OP de SMT com a OP de IM (Plano de Produção + Controle de OP).
- Sala tratada como **estacionamento FIFO**: o sistema sugere a vaga na entrada, libera a vaga na saída e mostra a ordem de retirada.
- **Sala 3D** e **Modo TV** em tempo real, para a TV do lado de fora da sala.
- Aging, dashboards, assinatura do alimentador, log e backups.

## Versão atual
- **v8.3** (17/10/2026) — **alerta de palete parado** há mais de X horas (cor "envelhecimento (horas)" do verde ao vermelho aos poucos, faixa na sala, aviso no canto, TV); **Modo TV em páginas** (troca a cada 20 s: sala 3D → indicadores → próximos a sair); **busca rápida** de OP/LPN na aba da sala (câmera vai até o palete, realce igual ao "Guardar o palete"); nova aba **Estratégia** (só Key User): previsão de lotação, relatório do turno com gráficos e mapa de calor de uso das vagas. Correções do roteiro de testes: tela Guardar em tela cheia, `#tv` sai da URL ao fechar a TV, menu sem piscar, painel "Próximos a sair" sem rolagem horizontal, rotação 3D pela metade, texto "paletes sem plano de IM juntos".
- **v8.2** (17/10/2026) — aba **Buffer × Plano IM** em largura total, sem rolagem horizontal e com rolagem vertical até o fim da tela; sala 3D: "◀ CORREDOR · SAÍDA" não corta mais, cada vaga mostra **Pxx / Rxx** no chão, parede da porta 25% mais perto, janelas viraram **vãos abertos** (3 no fundo, 1 na parede da porta, 0 na parede paralela), tela "Guardar o palete" escurece a sala em volta da vaga indicada, vagas de **retrabalho podem receber palete por escolha manual**.
- **v8.1** (16/10/2026) — leitura por **palete**, tela "Guardar o palete" com 3D, nova regra de vagas (fundo primeiro), aba **Acessos e Logins**, sala 3D sem porta e com janelas, Modo TV com câmera fixa, Vista 3D em tela cheia. Aba Assinatura do Alimentador removida.
- **v8.0** — integrada à Plataforma MMT + módulo PRO (`buffer_pro.js`).
- Base: "Controle de Magazines SMT v7.0" (HTML avulso no repositório BufferControl, que **não** é mais o alvo das mudanças).
- O trabalho é feito no repositório **Plataforma_MMT_2.0**, pasta `8 - Buffer Control/`.

## Estrutura de arquivos
```
8 - Buffer Control/
  index.html        sistema original v7 + bloco de integração com a Plataforma (no fim do arquivo)
  buffer_pro.js     módulo PRO: OP 7 dígitos, LPN/OP em qualquer ordem, leitura por palete,
                    Controle de OP, sala FIFO, tela "Guardar o palete", Sala 3D, Modo TV,
                    Vista 3D livre, mapa 2D, Acessos e Logins, backup de 3 h
  dev/mmt_local.js  modo local de teste (só carrega se a Plataforma não existir)
  CLAUDE.md         este arquivo
  dados/            banco JSON dividido por assunto (gerado pelo sistema)
    _banco.json                      metadados do banco (ordem das chaves)
    planos/ops_smt.json              plano SMT
    planos/ops_im.json               plano IM
    integracoes/cruzamentos.json     cruzamento SMT × IM (inclui escolhas manuais)
    integracoes/vinculo_op.json      última importação do Controle de OP
    movimentos/leituras.json         entradas e saídas
    movimentos/assinaturas.json      assinaturas do alimentador
    sala/layout.json                 grade da sala (ruas, posições, corredor, PC)
    sala/vagas.json                  vaga de cada LPN
    sistema/usuarios.json            usuários, excluídos, alimentadores
    sistema/log.json                 auditoria (últimos 5000)
    sistema/config.json              configurações
    sistema/outros.json              qualquer chave nova não mapeada (hoje: "acessos" e "usoVagas")
  backup/
    json/AAAA-MM/banco_AAAA-MM-DD_HHh.json
    excel/AAAA-MM/Backup_BufferControl_AAAA-MM-DD_HHh.xlsx
    excel/historico_leituras_magazines.xlsx    histórico contínuo (sistema original)
    estrutura_antiga/                          arquivos antigos de dados/ após a migração
```
Arquivos da Plataforma usados (não pertencem a este sistema):
- `../0 - Plataforma/comum/mmt.js`: ponte com a Plataforma (login, pasta virtual, banco dividido).
- `../Plataforma MMT.html`: abre o sistema num iframe.
- `../LEIA-ME.txt`: manual de uso.

## Como roda
- Sem servidor e sem build. Abre só pela **Plataforma MMT.html** (Edge/Chrome); quem grava na pasta da rede é a Plataforma.
- Login único da Plataforma: Admin na Plataforma = **Key User**; quem já existia mantém o perfil; matrícula nova recebe o "perfil de quem entra pela 1ª vez" (padrão **Operador**, configurável na aba Acessos e Logins).
- Bibliotecas via CDN (precisa de internet): Tailwind, Lucide, Chart.js, SheetJS 0.18.5, three.js **0.128.0** + OrbitControls (jsDelivr, carregados só ao abrir o 3D).
- Arquitetura do módulo PRO: `buffer_pro.js` **embrulha** funções globais do original (`normalizarOP`, `avancarPasso`, `finalizarLeitura`, `recalcularCruzamento`, `_mesclarBanco`, `_garantirEstrutura`, `mudarAba`, `renderTudo` e outras), guardando a versão original e chamando-a. Funcionalidade nova entra no módulo, não espalhada no `index.html`.
- Sincronização entre PCs: o original relê o banco a cada 2,5 s e grava em "ler, mesclar, gravar".

## Regras de negócio
**Etiqueta e leitura**
- OP = sempre os **7 dígitos iniciais**. Sufixos aceitos e removidos: `-SMT`, `-SMT-T`, `-SMT-B`, `-AI`. Exemplo: `1130000-SMT-B` vira `1130000`.
- O operador pode bipar o **LPN ou a OP primeiro**. Se o LPN vier antes, ele fica guardado e entra depois da OP.
- LPN válido: começa com **S** ou **A** e tem **15+ caracteres**.
- **Leitura por PALETE** (desde v8.1): OP → LPN do palete → quantidade TOTAL do palete, digitada na barra (o teclado na tela foi tirado). 1 leitura = 1 palete = 1 vaga. Depois de cada leitura, volta ao passo 1 (poka-yoke).
- Ao ler a OP aparece o card do **kit**: modelo, qtd. do kit, invoice, linha SMT e o **destino IM** (OP de IM, linha IM, data planejada com selo ATRASADA/HOJE/AMANHÃ).
- Na saída, a quantidade já vem preenchida com a da entrada daquele LPN (o operador confirma com Enter).
- Clicar em "Leitura de Palete" no menu abre a leitura em **tela cheia** (modo kiosk). O perfil Operador já abre em kiosk (tela cheia de verdade no 1º clique, exigência do navegador).
- OP precisa existir no Plano SMT. OP **fechada** (entrada ≥ total) não recebe mais entrada.
- Entrada: o LPN não pode entrar de novo enquanto estiver dentro (entradas > saídas).
- Saída: o LPN precisa ter entrada em aberto **na mesma OP**.

**Cruzamento SMT × IM** (prioridade, da maior para a menor)
1. Escolha **manual** do usuário.
2. **Controle de OP**.
3. Chaves do plano N1 a N5 (Invoice/PN/Qtd/Tipo/Modelo).

**Controle de OP** (lógica copiada do Consulta de Plano — madura, não simplificar)
- Lê a aba "TPV DO" primeiro e acha o cabeçalho com OP + Fase + Cód.Placa Limpa.
- Liga a OP de SMT à de IM pelo **Cód.Placa Limpa + Invoice/CEF + tipo de placa**.
- Trata TOP/BOTTOM separados, IM dividida, OP cancelada, linha PA e PREP.
- Grau de confiança: **SEGURO / PROVÁVEL / VERIFICAR / SEM OP DE IM**. VERIFICAR com várias OPs de IM vira "Ambíguo — escolher".
- Sempre mostra uma **prévia** antes de aplicar. A importação nova **substitui** a anterior.

**Sala FIFO**
- Grade da sala: Rua 01–11 × Posição 01–06.
  - Posição 05 = **corredor azul**, da Rua 01 à 10.
  - Porta à esquerda do corredor.
  - PC do operador em R01-P06.
  - R02-P06, R06-P06 e R07-P06 = sem vaga.
  - R11-P05 = vaga.
  - **R11-P01, P02, P03 = RETRABALHO** (tipo de célula `retrabalho`, lilás): vaga **reservada**. Desde v8.2:
    - entra em `vagasDaSala()` com `retrab: true`, cada uma numa fila própria de 1 vaga (`Rxx-Xyy`);
    - **nunca é sugerida** (`sugerirVaga` e "Outras boas vagas" ignoram), só escolha manual na tela Guardar (clicar no 3D ou na lista, botão lilás), com confirmação "só guarde se estiver vazia agora";
    - não conta nas KPIs de vagas (total/livres/ocupação);
    - vazia → no 3D aparece o palete de retrabalho (2 magazines + 2 bandejas), desenhado em `construirPaletes` (parte dinâmica); com palete do buffer → aparece o palete real; quando ele sai, o palete de retrabalho volta sozinho;
    - mapa 2D: "🛠 RETRAB." quando vazia, palete normal quando ocupada.
  - **Rua 11 = última opção** (`sala.ruaUltima`, editável no Layout; 0 = nenhuma): só é sugerida quando o resto estiver cheio.
- ID da vaga: `R03-P04` (Rua 03 · Posição 04).
- Layout v3 (`sala.versao = 3`): o v2 salvo é migrado sozinho (mantém as edições e só acrescenta retrabalho, `ruaUltima = 11`, `placasMag = 50`).
- **1 vaga = 1 palete = 1 OP** (1 LPN = 1 palete). No 3D o nº de magazines desenhados = placas do palete ÷ `placasMag` (1 a 12, 6 embaixo + 6 em cima). Dados antigos com vários LPNs (magazines) na mesma vaga continuam aparecendo juntos.
- Filas FIFO por rua: quem está colado no corredor é a **frente**.
  - Posições 04→03→02→01 formam uma fila.
  - Posição 06 = fila de 1 vaga (frente para o corredor).
  - Vaga na linha do corredor = fila de 1 vaga.
- Regra da fila: quem está na frente vai para a IM **antes ou no mesmo dia** de quem está atrás. Sem plano IM = vai por último.
- Sugestão de vaga (`avaliarVagas` / `sugerirVaga`, menor nota = melhor) — a fila é abastecida do **FUNDO para a FRENTE** (ergonomia):
  - Só conta a vaga livre **mais funda alcançável** pelo corredor sem mexer em ninguém. Vaga atrás de palete = "bloqueada" (só manual, com confirmação). Pular vaga do fundo é penalizado.
  1. Na frente de outro palete da mesma OP (sem quebrar FIFO).
  2. Fila com paletes, sem quebrar FIFO, data de IM parecida com quem fica atrás (mesmo modelo ganha ponto).
  3. Fila vazia → palete no fundo. IM atrasada/hoje/amanhã prefere vaga de 1 só (P06 / frente do corredor) para não travar uma fila inteira.
  4. Só em último caso, vaga que quebra o FIFO (com aviso).
  - Rua de última opção: +2000 (fica depois até da quebra de FIFO). Empate: rua mais perto da porta.
- Depois da leitura de entrada a vaga é **reservada** e abre a tela **"Guardar o palete"**: sala 3D com a vaga indicada (verde, seta, feixe; desde v8.2 o resto da sala fica ~50% mais escuro e um foco de luz fica na vaga), dados do palete, outras boas vagas e lista de todas as livres. Clicar numa vaga livre (no 3D ou na lista) troca a vaga. Enter / Esc / bipar a próxima etiqueta fecha.
  - Vaga atrás de outro palete (laranja) ou de retrabalho (lilás) pede confirmação num **mini aviso dentro da própria tela** (`_avisoGuardar`, desde v8.2 — não usa mais o `confirm()` do navegador): Enter = confirmar, Esc = cancelar. Os `confirm()` da aba Acessos e Logins (bloquear/excluir login) continuam do navegador.
- Saída libera a vaga. "Próximos a sair" = ordem por data da IM, depois posição na fila, depois hora de entrada, **agrupado por palete**.
- Cores de status: IM atrasada (vermelho), hoje (laranja), amanhã (amarelo), futura (azul), sem plano (cinza). Também dá para colorir por aging (5 dias = atenção, 7 dias = crítico) ou por modelo.
- Só o **Key User** edita o layout e importa coisas sensíveis.

**Acessos e Logins** (aba `PERM`, só Key User)
- Senha e reset de senha continuam **na Plataforma** (decisão do usuário em 16/10/2026: "mantém pela plataforma").
- Perfis: Key User (= Admin da Plataforma, vê tudo), **Guardião** (padrão: todas as abas), **Operador** (padrão: Leitura + Sala 3D). O perfil antigo "Alimentador" vale como Guardião.
- Cada perfil tem as abas marcadas na tabela; cada pessoa pode ter lista própria (`usuario.abas`, "personalizado") ou voltar ao padrão do perfil.
- Cadastrar login = matrícula da Plataforma + nome + perfil. Bloquear (`bloqueado`) mostra tela de bloqueio. Excluir = `removido: true` (não usa a lista de excluídos do original, para poder recadastrar).
- Abas sem acesso somem do menu; tentar abrir registra `ACESSO_NEGADO`. O acesso é reconferido a cada sincronização.
- Log com filtros (usuário, ação, período, texto) e exportação para Excel.
- Dados: `dbData.acessos` (vai para `sistema/outros.json`), mescla entre PCs pelo `atualizadoEm` mais recente; usuários pelo `atualizadoEm` (regra original).

**Alerta de horas, TV, busca e Estratégia** (v8.3)
- Alerta de palete parado: `sala.alertaHoras` (padrão **24 h**, o Key User muda na aba Estratégia). Conta desde a última entrada do LPN.
  - Cor "envelhecimento (horas)" no seletor da sala: verde (0 h) → amarelo (metade) → vermelho (X h ou mais), sem degraus; o 3D é refeito a cada 10 min nesse modo.
  - Faixa vermelha na aba da sala com os paletes velhos (clicar = busca); aviso no canto da tela quando um palete passa do limite (uma vez por palete; ao abrir o sistema não avisa os que já estavam velhos); linha no "Atenção" e card na página de indicadores da TV.
- Modo TV em páginas: `TV_PAGINAS` (Sala 3D · Indicadores · Próximos a sair), troca a cada `TV_TROCA_MS` = 20 s; bolinhas no canto mostram a página.
- Busca rápida (aba da sala): LPN exato → OP (7 dígitos) → parte do LPN (4+). Vários paletes da OP: vai no que sai primeiro e avisa as outras vagas. Esc / × limpa. Realce = `sala3d.destacar(vaga)` (seta, feixe, foco de luz e sala ~50% mais escura, igual à tela Guardar).
- Aba **Estratégia** (`ESTRAT`, só Key User, igual à `PERM`; não entra na tabela de perfis):
  - **Previsão de lotação** (14 dias): paletes de hoje + saldo do plano SMT com data (÷ palete médio dos últimos 30 dias) − saídas no dia da IM. OP atrasada conta como hoje; sem plano de IM não sai. Avisa o dia em que lota (≥ 100%) ou passa de 90%.
  - **Relatório do turno**: entradas, saídas, quebras de FIFO na saída (saiu enquanto havia palete com IM em dia anterior), tempo médio no buffer, quebras na sala agora, gráficos por hora e por faixa de tempo, botão Imprimir/PDF. Turnos em `sala.turnos` (padrão 06–14, 14–22, 22–06; botão "Horários").
  - **Mapa de calor**: horas ocupada ou nº de paletes por vaga (7/30/90 dias) + uso médio por rua.
- Histórico de uso: `dbData.usoVagas` = `{ id, lpn, op, vaga, de, ts }` gravado em `gravarVaga` a cada mudança de vaga (guardar, trocar, sair). Mescla append-only por id (igual às leituras), guarda 120 dias. Começou na v8.3: antes disso o mapa só conta os paletes que estavam na sala.

**Dados e backup**
- Mesclagem entre PCs: leituras/logs/assinaturas/ops/usoVagas são append-only por id; `vagas` vence pelo mais recente (`em`); `sala` pelo `atualizadoEm`; `vinculo` pelo `ts`.
- Backup automático a cada **3 h** (janelas 00h, 03h, …, 21h), em JSON + Excel. Qualquer PC aberto grava a janela se ela ainda não existir.
- Apaga backups com mais de **14 dias**: a idade sai do nome do arquivo e ele só apaga arquivos com esse padrão de nome.
- Registros de vaga de LPN que já saiu há mais de 30 dias são removidos ao abrir.

## Decisões tomadas
- O alvo é a versão da Plataforma (`8 - Buffer Control/`); o HTML avulso v7 fica congelado.
- O original fica intacto; tudo que é novo vai para `buffer_pro.js`, que embrulha as funções globais.
- `dados/` foi dividido por assunto para ficar leve. A estrutura antiga é migrada sozinha na 1ª abertura e os arquivos velhos vão para `backup/estrutura_antiga/`.
- O Controle de OP foi copiado do Consulta de Plano em vez de reinventado.
- A sala é modelada como **grade editável** (não blocos soltos), igual ao desenho do Excel do usuário.
- 3D com three.js r128, carregado sob demanda. O mapa 2D é o plano B quando o 3D não carrega.
- ~~O Modo TV balança a câmera ±25°~~ → desde v8.1 o **Modo TV fica parado na vista padrão** (a da foto do usuário, `posicoesVista('3d')`); dá para mexer com o mouse e 5 s depois volta sozinho para a mesma vista/distância.
- Botão **"Vista 3D (tela cheia)"** na aba da sala: navegação livre (sem trava no centro): arrastar gira, botão direito move, roda passa do ponto, W A S D / setas andam, Q/E sobe/desce, Shift rápido, duplo clique centraliza ali. Esc fecha.
- Motor 3D com modos `normal` · `tv` · `escolha` (tela Guardar) · `livre` (tela cheia). Só existe um renderer; `_remontar3D()` devolve o 3D para quem estava usando (Guardar > tela cheia > TV > aba da sala).
- A aba **Assinatura do Alimentador** foi removida (o `buffer_pro.js` tira o menu e a aba). Os termos antigos continuam no Relatório e em `movimentos/assinaturas.json`.

## Padrão visual
- Tailwind (CDN) com as cores do `tailwind.config` do index: `sidebar #021326`, `tpv #005b9f`, `aoc #e3000f`. Ícones Lucide.
- Cards brancos, `rounded-xl`, borda cinza; títulos `text-sidebar` com ícone `text-tpv`; KPIs em caixa com rótulo pequeno em maiúsculas.
- TV/3D: fundo escuro `#060b16` / `#0b1220`, números grandes, destaques azul-claro, verde, laranja e vermelho.
- Sala 3D fiel às fotos:
  - piso de granilite claro com fita amarela (lilás nas vagas de retrabalho);
  - corredor azul `#93bde6`;
  - paredes bege em painéis, com vãos de verdade: **porta só como abertura** (sem folha de porta) e **janelas também só como abertura** (sem vidro nem moldura, desde v8.2; 1,30 × 0,80 m): **3 na parede do fundo** (centralizadas, em −L/4, 0, +L/4), **1 na parede da porta** (a mais longe da porta) e **nenhuma na parede paralela à porta**;
  - parede da porta a 1,275 m da Rua 01 (`x0 = -1.275`, era -1,7 — 25% mais perto, v8.2); "POS xx" fica no meio desse espaço;
  - cada vaga (e retrabalho) tem no chão, pequeno e centralizado, **"Pxx" em cima e "Rxx" embaixo** (v8.2);
  - texto do chão (`textoChao`) diminui a fonte sozinho para não cortar (ex.: "◀ CORREDOR · SAÍDA");
  - PC do operador **de costas para a parede da porta** (girado 90° anti-horário);
  - TV **do lado de fora, à esquerda da porta** (para quem olha de fora);
  - pilares com faixa amarelo/preto;
  - placa SAÍDA verde;
  - paletes de madeira;
  - magazines com moldura de alumínio, laterais pretas, placas verdes e cantoneiras amarelas;
  - folha "IDENTIFICAÇÃO DE KIT" na frente.
- Mapa 2D com as cores do Excel do usuário: vaga verde, corredor azul, PC amarelo, sem vaga branco.
- Aba **Buffer × Plano IM** (`aba-AGING`, HTML original): `_ajustarAging()` no `buffer_pro.js` tira o `max-w-7xl` (largura total), troca o `overflow-x-auto max-h-[65vh]` por `.bp-ag-rolagem` (sem rolagem horizontal, rolagem vertical até `100vh - 250px`, cabeçalho fixo) e deixa as colunas quebrarem linha (OP e OP IM nunca quebram; LPN quebra se precisar).
- Textos da interface em **português do Brasil**, simples e diretos para o chão de fábrica.

## O que NÃO pode ser alterado (sem pedido explícito)
- O código original do `index.html` acima do bloco "PLATAFORMA MMT — integração". Mudanças entram por embrulho no `buffer_pro.js`.
- `../0 - Plataforma/comum/mmt.js` e a Plataforma em geral (são compartilhados por todos os sistemas).
- Nomes e caminhos dos arquivos em `dados/` e o formato das chaves (`ops`, `opsIM`, `cruzamentos`, `vinculo`, `leituras`, `assinaturas`, `sala`, `vagas`, `usuarios`, `logs`, `config`).
- O formato do ID de vaga `Rxx-Pyy` e o padrão de nome dos backups (a limpeza de 14 dias depende dele).
- As regras de validação de leitura (7 dígitos, LPN S/A 15+, OP fechada, entrada/saída em aberto).
- A lógica do Controle de OP (deve continuar igual à do Consulta de Plano).
- A prioridade do cruzamento: manual > Controle de OP > N1–N5.
- A regra de mesclagem entre PCs (risco de perder dados de outro computador).
- Login e perfis vêm da Plataforma: não recriar tela de login nem senha neste sistema.
- Não apagar nada em `backup/` fora da rotina de 14 dias.

## Pendências e bugs conhecidos
- **Confirmado pelo usuário (17/10/2026) — não mexer:** R02/R06/R07-P06 continuam "sem vaga"; R11-P05 é palete avulso; FIFO com Posição 04 = frente; IM atrasada/hoje/amanhã prefere vaga de 1 só (P06).
- **A confirmar (v8.3):**
  - Alerta de palete parado: 24 h é o valor certo? (muda na aba Estratégia)
  - Horários dos turnos (padrão 06–14, 14–22, 22–06).
  - Previsão de lotação usa o palete médio das entradas dos últimos 30 dias; confirmar se a data do plano SMT é a data em que o palete chega ao buffer.
- **A confirmar com o usuário:**
  - Medidas reais da sala (hoje estimadas: vaga 1,45 × 1,30 m; corredor 2,2 m).
- **A confirmar (v8.2):**
  - Na parede da porta ficou a janela do lado da Posição 01 (a mais longe da porta); do outro lado da porta (Posição 06) não há janela.
  - "Pxx / Rxx" só foi colocado no chão do 3D; o mapa 2D continua mostrando "livre".
  - Palete guardado no retrabalho não entra no FIFO de nenhuma fila (cada vaga de retrabalho é fila própria).
- **A confirmar (v8.1):**
  - Placas por magazine (só para o desenho 3D) = 50 por padrão.
- **Testes:** v8.0 testado com Plataforma simulada. v8.1 testado em Chrome headless com Plataforma falsa em memória (cópia dos JSON de `dados/`, nada gravado nos arquivos reais): leitura de entrada e saída, validações, tela Guardar e troca manual, sala/TV/tela cheia, retrabalho, layout, acessos (operador novo, bloqueado, personalizado, perfil antigo). Falta validar na Plataforma real, na rede, e no PC/TV da sala.
  - v8.3 testado do mesmo jeito (1280/1400/1700): tela Guardar em tela cheia (página, iframe e elemento interno), saída com qtd. preenchida, `#tv` → fechar → F5, menu, alerta de horas (faixa, cor, legenda, TV), busca (OP, LPN, inexistente), TV trocando as 3 páginas a cada 20 s, aba Estratégia (previsão, turno com gráficos, mapa de calor), Estratégia escondida para Guardião, `usoVagas` gravado no banco, sem erros no console. Não testado: impressão (janela do navegador), aviso no canto com o tempo passando de verdade, e tudo na Plataforma real/rede/TV.
  - Item "Próximos a sair não atualiza na Saída" (roteiro 17/10) não reproduziu; suspeita: outro LPN antigo na mesma vaga.
  - v8.2 testado do mesmo jeito (1400 × 800 e 1700 × 950): aba Buffer × Plano IM sem rolagem horizontal, sala 3D (vista padrão e de cima), tela Guardar com vaga normal e com vaga de retrabalho (confirmação, palete real no lugar do de retrabalho, KPIs sem contar o retrabalho, palete de retrabalho volta quando o palete sai), sem erros no console. Não testado: Modo TV e saída real por leitura de etiqueta (a saída foi simulada movendo o palete para outra vaga).
- **Internet:** sem internet, o 3D não carrega (só o mapa 2D funciona) e a tela fica sem formatação (Tailwind via CDN).
- **Dados antigos:** magazines que já estavam no buffer antes do módulo PRO ficam "sem vaga" até clicar em **"Alocar sem vaga"**.
- **Rótulos 3D:** com a sala muito cheia, os rótulos flutuantes se sobrepõem um pouco na vista 3D.
- **Tela cheia:** a Plataforma permite (`allow="fullscreen"`), mas o navegador pode pedir clique; o overlay da TV funciona mesmo sem tela cheia.
- **Desempenho:** o 3D é refeito quando muda a ocupação (a cada sincronização de 2,5 s, só se algo mudou). Vale observar o desempenho no PC da TV.
- **Backup:** vários PCs abertos podem disputar a mesma janela de backup (inofensivo: o primeiro grava, os outros pulam).
- Para abrir direto no Modo TV, use o sufixo `#tv` na URL do sistema; isso ainda não foi validado dentro do iframe da Plataforma.
