# Modelo de Clearing e Receita — EnergyPay

> **Status:** especificação consolidada (rascunho para implementação pós-demo).
> Itens marcados com ⚙️ são parâmetros de negócio **a confirmar**; trazem o default recomendado.
> Documento em PT-BR; uma versão EN pode ser derivada para o SCF.

---

## 1. Posicionamento

A EnergyPay é a **pré-camada de liquidação financeira** do mercado livre de energia (ACL):
uma ferramenta de **registro, auditoria e garantia** das posições e contratos **antes** da
liquidação financeira de fato (que segue entre as tesourarias / CCEE).

- **Não** trata o físico (sem medição/entrega).
- **Não** move dinheiro de liquidação de energia (só taxas de serviço da plataforma).
- **Não** é mercado/exchange e **não** há P2P livre de token.
- **EPWR** é a representação on-chain da **posição** de energia (1 EPWR = 1 MWh). **Não tem
  valor de mercado** e **não circula** fora do fluxo de contrato.

**Conformidade (CVM):** sem mercado secundário e sem valor de mercado para o EPWR, a plataforma
não negocia ativo nem faz câmbio; o que se cobra é **taxa de serviço** sobre um **nocional em
R$**. Isso reduz o risco de classificação como valor mobiliário. *(Validar com jurídico
especializado em CVM/cripto — não é parecer legal.)*

---

## 2. Modelo de contrato e posição

### 2.1 Registro do contrato
Campos inseridos no registro (acordo bilateral):
- Partes (comprador/vendedor; multi-party com papéis).
- **Volume** (MWh) — `volume_mwh`.
- **Preço acordado** (R$/MWh) — `price_brl`. Negociado bilateralmente no dia; a plataforma
  apenas **registra** (não calcula regra de preço).
- Datas (início/fim), submercado, nº do contrato (opcional), documento PDF (opcional).

### 2.2 Aprovação → posição (EPWR)
Na **aprovação bilateral**, o comprador recebe os **EPWR** que representam o volume negociado —
imediatamente disponíveis para **renegociar**. A posição é o registrado na plataforma.

### 2.3 Conservação de energia (cadeia A → B → C)
- **Gerador (origem)** vende → **emite** EPWR novo (entra energia no sistema).
- **Revenda (comercializadora)** vende → **transfere** o EPWR que já possui (não emite).
- Regra do motor: vendedor com lastro suficiente → **transfere**; gerador sem lastro → **emite**.
- Exemplo: A (gerador) vende 1.000 MWh a B → emite 1.000 a B. B só pode revender **até 1.000**;
  ao vender, transfere e **zera** a posição. Energia conservada na cadeia.

### 2.4 Limite e não-dupla-venda (a garantia)
- `posição(player) = Σ compras − Σ vendas = EPWR detido`. Deve ficar **≥ 0**.
- Trava: ao registrar/aprovar uma **venda**, exigir `volume ≤ posição disponível`.
- **Não dá para vender o que não se tem** → sem dupla-venda. **Essa é a garantia** que a
  plataforma oferece ao setor.

### 2.5 Liquidação automática ao atingir o limite
Quando as vendas de um player atingem sua posição (limite), a **finalização é automática**:
registro/trava on-chain da posição (evidência de auditoria) — **não** transferência de dinheiro.
Na escala de **200–2.000 transações/dia**, a liquidação **tem de ser automatizada** (fila +
orquestração em lote).

### 2.6 Papel do PLD
No mercado tradicional, o PLD liquida a **diferença entre contratado e medido fisicamente**.
Como aqui **não há físico**, o PLD entra apenas como **referência / marcação a mercado**
(indicador de exposição nos painéis) — **não** liquida nada. Gancho futuro: ao plugar camada
física, ativar CfD ao PLD.

---

## 3. Modelo de receita

Receita **dupla**, cobrada em **BRL** pela infra existente (Asaas: PIX/cartão/boleto) —
**nunca** sobre o EPWR.

### 3.1 Assinatura (acesso + permissões)
Três planos (já no banco): **Free**, **Operator**, **Enterprise**.

| Capacidade | Free | Operator | Enterprise |
|---|---|---|---|
| Registrar contratos | ✅ | ✅ | ✅ |
| Liquidações / mês | **5** | ilimitado | ilimitado |
| Carteira de custódia | ✅ | ✅ | ✅ |
| Painéis Clearing / Risco (analytics) | ❌ | ✅ | ✅ |
| API x402 | ❌ | ❌ | ✅ (50k/mês) |
| Relatórios regulatórios avançados / multi-conta | ❌ | ❌ | ✅ |
| Suporte | comunidade | prioritário | dedicado |

*(Remover "P2P contract access" das features do Operator — P2P foi descontinuado.)*

**Cortesia:** usuários **administrativos** (PLATFORM_OWNER / PLATFORM_ADMIN) recebem **Enterprise gratuito** (sem cobrança, sem expiração) — regra aplicada no endpoint `/api/subscriptions/me`, valendo inclusive para admins futuros. A conta de demo **Power Trade** também recebe Enterprise cortesia.

### 3.2 Taxa por transação
- **0,05% = taxa padrão, automática** sobre o nocional (`volume × price_brl`), sem compromisso
  (pay-as-you-go). É o default de quem não tem pacote.
- **Pacotes promocionais (opt-in, comprados na conta):** comprometem um **volume** a uma
  **alíquota menor** (até **0,008%**). **Take-or-pay:** paga-se a taxa sobre o **volume
  contratado do pacote, use ou não**.

| Pacote | Volume comprometido (MWh) | Alíquota | Mínimo (take-or-pay) |
|---|---|---|---|
| Avulso (sem pacote) | — | **0,050%** automático | paga por transação |
| Ativo | 1.000 | 0,030% | alíquota × nocional do volume comprometido |
| Profissional | 10.000 | 0,018% | idem |
| Institucional | 50.000 | 0,012% | idem |
| Market Maker | 200.000 | 0,008% | idem |

- **Cobrança:** acumula as taxas do mês → **uma fatura mensal consolidada** (PT). Inviável cobrar
  por transação a 200–2.000/dia.
- **Base do nocional:** sempre `volume × price_brl` (R$). Fee nunca em EPWR.

### 3.3 Parâmetros a confirmar ⚙️
1. **Preço de referência do mínimo do pacote** (o pacote compromete MWh; o mínimo em R$ precisa
   de preço): **(a) referência fixa configurável (R$/MWh)** *(recomendado)* ou (b) PLD vigente.
2. **Excedente** (transacionou acima do pacote): **alíquota do pacote** *(recomendado)* ou volta a 0,05%.
3. **Período do pacote:** **mensal** *(recomendado)*.
4. **Quem compra pacote:** qualquer plano *(provável)* ou só Operator/Enterprise.
5. **Alíquotas/limiares** das tabelas acima (propostos; ajustar à realidade).

---

## 4. Escala alvo

- **200–2.000 transações/dia** na rede.
- Implicações: liquidação **automatizada** obrigatória; fee **acumulado + faturado mensalmente**;
  orquestração projetada para lote. Throughput Stellar: folgado (~1 a cada 40s no pico).

---

## 5. Plano de implementação (pós-demo)

### Backend
- `lib/planCapabilities.js` — mapa tier → {limite de liquidações, capacidades}.
- `middleware/requirePlan.js` — `requireCapability(cap)` aplicado a: liquidação (checa+incrementa
  `settlements_used` no Free), `/x402` (Enterprise), painéis clearing/risco (Operator+).
- **Razão de posição** por player (`available_mwh = Σ compras − Σ vendas`) + trava de venda.
- **Motor transfere-vs-emite** (conservação na cadeia).
- **Auto-liquidação** ao atingir o limite (fila/orquestração; respeita snapshot de PLD validado
  onde aplicável).
- `transaction_fees` (ledger): nocional, alíquota aplicada, fee_brl, status; agregação → fatura
  mensal.
- Tabela/serviço de **pacotes** (compra, volume comprometido, take-or-pay, excedente, expiração).

### Frontend
- Helper de plano + **gating** de menu/páginas (item bloqueado → "fazer upgrade").
- UI de **pacotes promocionais** (compra na conta) + visão de consumo do pacote.
- **Billing/fatura em PT** (polir descrições Asaas/PDF; padronizar "anual"; fatura mensal de fees).

### Migrations / dados
- Atualizar `features` dos planos (tirar P2P; refletir a matriz).
- Tabelas: `transaction_fees`, `fee_packages` / `user_fee_packages`.
- **Contas de demo (01-Support, Power Trade, New Energy) → Enterprise**, para o gating não
  quebrar a gravação.

### Verificação
- `node --check` backend · `tsc --noEmit` · `npm run build` · commit + push.

---

## 6. Resumo em uma frase

Um **livro-razão de posições de energia à prova de adulteração** que impede dupla-venda e gera
evidência auditável (a garantia), monetizado por **assinatura (acesso) + taxa de serviço por
transação** (0,05% padrão, com pacotes promocionais take-or-pay até 0,008%) — tudo em R$, sem
nunca dar valor de mercado ao EPWR.
