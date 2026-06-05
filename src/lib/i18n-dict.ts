/**
 * Portuguese (pt-BR) translations, keyed by the English SOURCE string.
 *
 * Missing keys fall back to the English source, so partial coverage NEVER breaks
 * the UI — untranslated text simply renders in English until an entry is added.
 *
 * Proper nouns and technical terms are intentionally NOT translated and must be
 * kept verbatim: EnergyPay, Stellar, Stellar Mainnet, EPWR, x402, ed25519,
 * Horizon, PLD, txHash, ledger, "settlement", "clearing", etc.
 */
export const PT: Record<string, string> = {
  // ── Language gate ──
  "Choose your language": "Escolha seu idioma",

  // ── Login ──
  "Operator Access · Pilot Environment": "Acesso do operador · Ambiente piloto",
  "Programmable settlement": "Settlement programável",
  "for energy markets.": "para mercados de energia.",
  "Operator Email": "E-mail do operador",
  Password: "Senha",
  "Access Clearing Environment": "Acessar ambiente de Clearing",
  "Authenticating…": "Autenticando…",
  "Authenticated against the EnergyPay clearing backend. Sessions are scoped to this browser tab.":
    "Autenticado no backend de clearing da EnergyPay. As sessões são restritas a esta aba do navegador.",
  "First time here?": "Primeira vez aqui?",
  "Provision new settlement identity": "Provisionar nova identidade de settlement",
  "Create your operator account · ed25519 keypair · market roles":
    "Crie sua conta de operador · keypair ed25519 · papéis de mercado",
  "Guided tour · how to sign in": "Tutorial guiado · como entrar",
  "Forgot password →": "Esqueceu a senha →",
  "Operator email and password are required.": "E-mail e senha do operador são obrigatórios.",
  "Authentication failed": "Falha na autenticação",
  "Email verified successfully! You can now log in.":
    "E-mail verificado com sucesso! Agora você pode entrar.",
  "Operator connected:": "Operador conectado:",
  "Operator access connects an existing settlement identity to the EnergyPay clearing network, anchored to":
    "O acesso de operador conecta uma identidade de settlement existente à rede de clearing da EnergyPay, ancorada na",
  "for institutional reconciliation.": "para reconciliação institucional.",
  "Operational credentials": "Credenciais operacionais",
  "· scoped to clearing desk & reconciliation": "· restritas à mesa de clearing e reconciliação",
  "Settlement identity": "Identidade de settlement",
  "· ed25519 keypair bound to operator": "· keypair ed25519 vinculado ao operador",
  "Network status": "Status da rede",
  "· Settlement Network": "· Settlement Network",
  "Settlement Network · Access Terminal": "Settlement Network · Terminal de Acesso",
  "Network nominal": "Rede nominal",
  "Email address": "Endereço de e-mail",
  "Light mode": "Modo claro",
  "Dark mode": "Modo escuro",

  // register
  "Tax / Registration ID": "Documento fiscal / de registro",
  "(optional)": "(opcional)",
  "Enter at least 4 characters.": "Insira ao menos 4 caracteres.",
  "CNPJ must have 14 digits.": "O CNPJ deve ter 14 dígitos.",
  "CPF must have 11 digits.": "O CPF deve ter 11 dígitos.",
  "Complete the highlighted fields to continue.": "Preencha os campos destacados para continuar.",
  "Operational credentials incomplete.": "Credenciais operacionais incompletas.",
  "Identity document upload failed (you can add it later):":
    "Falha no envio do documento de identidade (você pode adicioná-lo depois):",
  "Settlement Network unreachable.": "Settlement Network inacessível.",
  "Geolocation unavailable on this device.": "Geolocalização indisponível neste dispositivo.",
  "Operational coordinates bound to identity.": "Coordenadas operacionais vinculadas à identidade.",
  "GPS denied — provide a region manually.": "GPS negado — informe uma região manualmente.",
  "Manual region recorded.": "Região manual registrada.",
  "Enter valid latitude/longitude.": "Insira latitude/longitude válidas.",
  "Clearing & Settlement Infrastructure": "Infraestrutura de Clearing & Settlement",
  "Network Provisioning · Pilot Environment": "Provisionamento de rede · Ambiente piloto",
  "Provision a settlement participant identity.": "Provisione uma identidade de participante de settlement.",
  "Mints an identity, binds an ed25519 keypair and registers your market roles on Stellar.":
    "Emite uma identidade, vincula um keypair ed25519 e registra seus papéis de mercado na Stellar.",
  "Onboarding Steps": "Etapas de onboarding",
  Network: "Rede",
  Nominal: "Nominal",
  Chain: "Cadeia",
  Required: "Obrigatório",
  "Institutional email": "E-mail institucional",
  "WhatsApp phone": "Telefone WhatsApp",
  "Participant role": "Papel de participante",
  "Backend key custody": "Custódia de chave no backend",
  "EnergyPay Clearing · v0.4.2": "EnergyPay Clearing · v0.4.2",
  "Operator Access →": "Acesso do operador →",
  "Settlement Network · Provisioning Terminal": "Settlement Network · Terminal de provisionamento",
  "SECURE · TLS · ed25519": "SEGURO · TLS · ed25519",
  Step: "Etapa",
  of: "de",
  "Provisioning Failed · Settlement Rail": "Falha no provisionamento · Settlement Rail",
  DISMISS: "DISPENSAR",
  "Session preserved. Re-submit when the backend is reachable — no operator state was cleared.":
    "Sessão preservada. Reenvie quando o backend estiver acessível — nenhum estado do operador foi descartado.",
  "§ 01 · Operator Credentials": "§ 01 · Credenciais do operador",
  "Full Name": "Nome completo",
  "Phone Number *": "Número de telefone *",
  "Required for 2FA. Include country code, e.g. +55 11 99999-9999":
    "Obrigatório para 2FA. Inclua o código do país, ex.: +55 11 99999-9999",
  "Include country code — e.g. +55 11 99999-9999":
    "Inclua o código do país — ex.: +55 11 99999-9999",
  "§ 02 · Organization & Jurisdiction": "§ 02 · Organização & jurisdição",
  Organization: "Organização",
  Country: "País",
  "Select country…": "Selecione o país…",
  "State / Province": "Estado / província",
  "Select state…": "Selecione o estado…",
  City: "Cidade",
  "Select country first…": "Selecione o país primeiro…",
  "Select state first…": "Selecione o estado primeiro…",
  "Select city…": "Selecione a cidade…",
  "Other…": "Outro…",
  "§ 02c · Identity Document": "§ 02c · Documento de identidade",
  "Identity Type": "Tipo de identidade",
  Individual: "Pessoa física",
  Company: "Pessoa jurídica",
  "Only PDF files are accepted.": "Apenas arquivos PDF são aceitos.",
  "File too large — maximum 15 MB.": "Arquivo muito grande — máximo de 15 MB.",
  Attached: "Anexado",
  "Attach document · PDF · optional": "Anexar documento · PDF · opcional",
  "Remove document": "Remover documento",
  "§ 02b · Operational Geolocation · Optional": "§ 02b · Geolocalização operacional · Opcional",
  BOUND: "VINCULADO",
  "GPS DENIED": "GPS NEGADO",
  UNBOUND: "NÃO VINCULADO",
  "Requesting…": "Solicitando…",
  "GPS Bound": "GPS vinculado",
  "Capture GPS coordinates": "Capturar coordenadas de GPS",
  "Bind operational coordinates to your settlement identity":
    "Vincule coordenadas operacionais à sua identidade de settlement",
  "Used for grid map placement & regional liquidity attribution. Coordinates remain session-scoped and are never shared with counterparties.":
    "Usadas para posicionamento no mapa da rede e atribuição regional de liquidez. As coordenadas permanecem restritas à sessão e nunca são compartilhadas com contrapartes.",
  "Apply Region": "Aplicar região",
  "§ 03 · Market Participant Roles": "§ 03 · Papéis de participante de mercado",
  "Enable all capabilities →": "Habilitar todas as capacidades →",
  "Select one or more market participant roles.":
    "Selecione um ou mais papéis de participante de mercado.",
  "capability scoped to identity.": "capacidade atribuída à identidade.",
  "capabilities scoped to identity.": "capacidades atribuídas à identidade.",
  "§ 03b · Generation Source": "§ 03b · Fonte de geração",
  "Select every generation source you operate — choose as many as apply.":
    "Selecione todas as fontes de geração que você opera — escolha quantas se aplicarem.",
  "Fund settlement account on": "Financiar conta de settlement na",
  "Provisions a Stellar Mainnet account for institutional settlement operations.":
    "Provisiona uma conta na Stellar Mainnet para operações institucionais de settlement.",
  "§ 04b · Settlement Wallet": "§ 04b · Carteira de settlement",
  "A new ed25519 keypair will be generated server-side, encrypted with AES-256 and stored securely by EnergyPay. Your public key is always visible in your profile. The secret key is never transmitted to or stored in the frontend.":
    "Um novo keypair ed25519 será gerado no servidor, criptografado com AES-256 e armazenado com segurança pela EnergyPay. Sua chave pública fica sempre visível no seu perfil. A chave secreta nunca é transmitida ao nem armazenada no frontend.",
  "Existing Wallet — Public Key Only": "Carteira existente — somente chave pública",
  "Stellar Public Key (G…)": "Chave pública Stellar (G…)",
  "Must be a 56-character Stellar public key starting with G":
    "Deve ser uma chave pública Stellar de 56 caracteres começando com G",
  "Self-Custody · Zero Secret Storage": "Autocustódia · Zero armazenamento de chave secreta",
  "EnergyPay never stores, requests or transmits your secret key. When a transaction requires your signature, an unsigned XDR will be presented in a local signing modal — you enter your secret key, it signs in memory, and the signed transaction is sent directly to Stellar. Your secret never leaves your device.":
    "A EnergyPay nunca armazena, solicita ou transmite sua chave secreta. Quando uma transação exige sua assinatura, um XDR não assinado é apresentado em um modal de assinatura local — você insere sua chave secreta, ela é assinada em memória e a transação assinada é enviada diretamente à Stellar. Sua chave secreta nunca sai do seu dispositivo.",
  "EnergyPay managed · AES-256 encrypted at rest · ed25519 · Stellar Mainnet":
    "Gerenciada pela EnergyPay · criptografada em repouso com AES-256 · ed25519 · Stellar Mainnet",
  "User-controlled · public key only · local signing modal for every transaction":
    "Controlada pelo usuário · somente chave pública · modal de assinatura local para cada transação",
  Back: "Voltar",
  "Provision Settlement Identity": "Provisionar identidade de settlement",
  Continue: "Continuar",
  "Already provisioned?": "Já provisionado?",
  "Provisioning Settlement Identity": "Provisionando identidade de settlement",
  OK: "OK",
  "Network:": "Rede:",
  Provisioning: "Provisionando",
  "Settlement Identity Active": "Identidade de settlement ativa",
  "Public Key": "Chave pública",
  "Signer custody": "Custódia do signatário",
  "User-controlled wallet": "Carteira controlada pelo usuário",
  "EnergyPay managed wallet": "Carteira gerenciada pela EnergyPay",
  "Your public key is registered. Secret key never stored by EnergyPay — you sign each transaction locally.":
    "Sua chave pública está registrada. A chave secreta nunca é armazenada pela EnergyPay — você assina cada transação localmente.",
  "Secret key is encrypted with AES-256 and stored by EnergyPay. The frontend never receives or transmits the secret key.":
    "A chave secreta é criptografada com AES-256 e armazenada pela EnergyPay. O frontend nunca recebe nem transmite a chave secreta.",
  "Network Settlement Receipt": "Recibo de settlement na rede",
  "Provisioning Tx Hash": "Tx Hash de provisionamento",
  "PENDING · awaiting backend confirmation": "PENDENTE · aguardando confirmação do backend",
  "Ledger Sequence": "Sequência de ledger",
  PENDING: "PENDENTE",
  "Settlement Status": "Status de settlement",
  Funded: "Financiada",
  Yes: "Sim",
  "No · Pending": "Não · Pendente",
  Roles: "Papéis",
  Address: "Endereço",
  "Provisioned Capabilities": "Capacidades provisionadas",
  "Audit account on Stellar Expert": "Auditar conta no Stellar Expert",
  "Enter Settlement Control Room": "Entrar na sala de controle de settlement",
  "Verification email sent — check your inbox.":
    "E-mail de verificação enviado — confira sua caixa de entrada.",
  "Verify Your Email": "Verifique seu e-mail",
  "We sent a verification link to your email address.":
    "Enviamos um link de verificação para o seu endereço de e-mail.",
  "⚠ Dev mode — email not configured": "⚠ Modo dev — e-mail não configurado",
  "Resend blocked the email. Open this link directly to verify:":
    "O reenvio bloqueou o e-mail. Abra este link diretamente para verificar:",
  "Click the link in your email to verify your account. After verifying, click the button below to continue.":
    "Clique no link do seu e-mail para verificar sua conta. Após verificar, clique no botão abaixo para continuar.",
  "I've Verified My Email": "Verifiquei meu e-mail",
  "Email Sent": "E-mail enviado",
  "Resend Verification Email": "Reenviar e-mail de verificação",
  "Failed to save phone": "Falha ao salvar o telefone",
  "Phone number saved.": "Número de telefone salvo.",
  "Verification code sent to your phone.": "Código de verificação enviado para o seu telefone.",
  "Phone verified!": "Telefone verificado!",
  "Verify Your Phone": "Verifique seu telefone",
  "We'll send a 6-digit code to your phone.": "Enviaremos um código de 6 dígitos para o seu telefone.",
  "Phone Number (with country code)": "Número de telefone (com código do país)",
  Save: "Salvar",
  "Click below to receive a verification code on your WhatsApp.":
    "Clique abaixo para receber um código de verificação no seu WhatsApp.",
  "Send WhatsApp Code": "Enviar código por WhatsApp",
  "⚠ Dev mode — Twilio not configured": "⚠ Modo dev — Twilio não configurado",
  "Your code is:": "Seu código é:",
  "Enter 6-digit code": "Insira o código de 6 dígitos",
  "Sending…": "Enviando…",
  "Resend Code": "Reenviar código",
  copied: "copiado",
  "Clipboard unavailable": "Área de transferência indisponível",
  "§ 04 · Interface Theme": "§ 04 · Tema da interface",
  "You can change the theme anytime from the Operator Profile menu.":
    "Você pode alterar o tema a qualquer momento no menu Perfil do operador.",
  // register · provisioning steps
  "Validating institutional credentials": "Validando credenciais institucionais",
  "Allocating operator identity": "Alocando identidade do operador",
  "Generating ed25519 keypair": "Gerando keypair ed25519",
  "Binding settlement address to operator": "Vinculando endereço de settlement ao operador",
  "Verifying settlement account funding on Stellar Mainnet":
    "Verificando financiamento da conta de settlement na Stellar Mainnet",
  "Registering market participant roles": "Registrando papéis de participante de mercado",
  "Publishing identity to Settlement Network": "Publicando identidade na Settlement Network",
  "Importing existing ed25519 keypair": "Importando keypair ed25519 existente",
  // register · onboarding steps
  "Fill this form": "Preencha este formulário",
  "Credentials, roles & wallet": "Credenciais, papéis & carteira",
  "Verify your email": "Verifique seu e-mail",
  "Confirmation link sent to your inbox": "Link de confirmação enviado para sua caixa de entrada",
  "Access the environment": "Acesse o ambiente",
  "Settlement identity is live": "Identidade de settlement ativa",
  // register · form steps
  Credentials: "Credenciais",
  "Organization & identity": "Organização & identidade",
  "Market roles": "Papéis de mercado",
  "Settlement setup": "Configuração de settlement",
  // register · generation sources
  "Solar PV": "Solar fotovoltaica",
  Hydroelectric: "Hidrelétrica",
  "Small Hydro": "Pequena central hidrelétrica",
  Wind: "Eólica",
  Biomass: "Biomassa",
  "Natural Gas": "Gás natural",
  Nuclear: "Nuclear",
  Thermal: "Termelétrica",
  Cogeneration: "Cogeração",
  // register · wallet options
  "EnergyPay Managed Wallet": "Carteira gerenciada pela EnergyPay",
  "Platform generates and securely manages your keypair — secret never exposed in the frontend":
    "A plataforma gera e gerencia com segurança o seu keypair — a chave secreta nunca é exposta no frontend",
  "Link Existing Wallet": "Vincular carteira existente",
  "Provide your public key — you sign each transaction locally, secret never stored":
    "Forneça sua chave pública — você assina cada transação localmente, a chave secreta nunca é armazenada",
  // register · theme options
  Dark: "Escuro",
  "Institutional dark mode — reduced eye strain for control room environments":
    "Modo escuro institucional — menor fadiga visual para ambientes de sala de controle",
  Light: "Claro",
  "Clean light interface — high contrast for daylight and presentation use":
    "Interface clara e limpa — alto contraste para uso à luz do dia e em apresentações",

  // landing
  Roadmap: "Roadmap",
  "Programmable Pre-Clearing & Settlement Infrastructure":
    "Infraestrutura programável de Pré-Clearing & Settlement",
  "Launch Mainnet Platform": "Acessar plataforma Mainnet",
  "Live on": "Ao vivo na",
  "Programmable financial rail": "Trilho financeiro programável",
  "for electricity markets": "para mercados de eletricidade",
  "EnergyPay is a programmable settlement and reconciliation infrastructure for electricity markets. It helps generators, sellers, utilities, investors and consumers register bilateral energy obligations, manage counterparty risk, and execute auditable settlements on":
    "A EnergyPay é uma infraestrutura programável de settlement e reconciliação para mercados de eletricidade. Ela ajuda geradores, vendedores, distribuidoras, investidores e consumidores a registrar obrigações bilaterais de energia, gerenciar risco de contraparte e executar settlements auditáveis na",
  "Provision settlement identity": "Provisionar identidade de settlement",
  Finality: "Finalização",
  "Stellar ledger close": "Fechamento de ledger da Stellar",
  "Settlement asset": "Ativo de settlement",
  "Tokenized energy": "Energia tokenizada",
  Audit: "Auditoria",
  "Publicly verifiable": "Verificável publicamente",
  Demo: "Demonstração",
  "See EnergyPay in action": "Veja a EnergyPay em ação",
  "A walkthrough of programmable pre-clearing and settlement of bilateral energy contracts on":
    "Um passo a passo do pré-clearing e settlement programáveis de contratos bilaterais de energia na",
  "EnergyPay — Product Video": "EnergyPay — Vídeo do produto",
  "The Problem": "O problema",
  "Energy settlement is fragmented, manual and hard to audit.":
    "O settlement de energia é fragmentado, manual e difícil de auditar.",
  "Bilateral power contracts are reconciled across disconnected systems, with no shared, verifiable source of truth between counterparties and regulators.":
    "Contratos bilaterais de energia são reconciliados em sistemas desconexos, sem uma fonte de verdade compartilhada e verificável entre contrapartes e reguladores.",
  "Fragmented reconciliation": "Reconciliação fragmentada",
  "Obligations live across spreadsheets, ERPs and bank statements that rarely agree.":
    "As obrigações ficam espalhadas em planilhas, ERPs e extratos bancários que raramente coincidem.",
  "Counterparty risk": "Risco de contraparte",
  "Bilateral exposure and default risk with no common ledger between parties.":
    "Exposição bilateral e risco de inadimplência sem um ledger comum entre as partes.",
  "Slow, manual settlement": "Settlement lento e manual",
  "Clearing cycles take days, with manual transfers and opaque status.":
    "Os ciclos de clearing levam dias, com transferências manuais e status opaco.",
  "No verifiable audit trail": "Sem trilha de auditoria verificável",
  "Auditors and regulators cannot independently confirm who settled what, and when.":
    "Auditores e reguladores não conseguem confirmar de forma independente quem liquidou o quê, e quando.",
  "The Solution": "A solução",
  "One programmable rail from obligation to on-chain finality.":
    "Um único trilho programável da obrigação até a finalização on-chain.",
  "Register obligations": "Registrar obrigações",
  "Capture bilateral energy contracts as structured, programmable settlement terms.":
    "Capture contratos bilaterais de energia como termos de settlement estruturados e programáveis.",
  "Manage counterparty risk": "Gerenciar risco de contraparte",
  "Counterparty exposure and risk visibility across market roles.":
    "Visibilidade de exposição e risco de contraparte entre os papéis de mercado.",
  "Execute on Stellar": "Executar na Stellar",
  "Deterministic settlement with ~5s finality on the public network.":
    "Settlement determinístico com finalização em ~5s na rede pública.",
  "Reconcile & audit": "Reconciliar & auditar",
  "Auto-match settlements to on-chain receipts with an immutable trail.":
    "Concilie automaticamente os settlements com os recibos on-chain por meio de uma trilha imutável.",
  "Product Modules": "Módulos do produto",
  "A full clearing & settlement operating system.":
    "Um sistema operacional completo de clearing & settlement.",
  "Composable modules covering treasury, settlement execution, custody, clearing, market data and audit.":
    "Módulos combináveis que cobrem tesouraria, execução de settlement, custódia, clearing, dados de mercado e auditoria.",
  "Treasury & Rails": "Tesouraria & trilhos",
  "Treasury balances, settlement rails and liquidity routing.":
    "Saldos de tesouraria, trilhos de settlement e roteamento de liquidez.",
  "Settlement Console": "Console de settlement",
  "Operate, monitor and reconcile settlement batches in real time.":
    "Opere, monitore e reconcilie lotes de settlement em tempo real.",
  "Direct Settlement": "Settlement direto",
  "Execute bilateral transfers with ~5s Stellar finality.":
    "Execute transferências bilaterais com finalização Stellar em ~5s.",
  "x402 API Access": "Acesso à API x402",
  "Machine-to-machine payments (x402) for metered, pay-per-call access to market-data and oracle APIs.":
    "Pagamentos máquina a máquina (x402) para acesso medido e pago por chamada a APIs de dados de mercado e de oráculo.",
  "Custody Wallet": "Carteira de custódia",
  "Platform-managed or user-controlled Stellar settlement accounts.":
    "Contas de settlement Stellar gerenciadas pela plataforma ou controladas pelo usuário.",
  "Clearing & Risk": "Clearing & risco",
  "Counterparty netting, exposure limits and clearing supervision.":
    "Compensação de contraparte, limites de exposição e supervisão de clearing.",
  "Oracle & Market Data": "Oráculo & dados de mercado",
  "Reference price feeds (PLD / market rates) for settlement.":
    "Feeds de preço de referência (PLD / taxas de mercado) para settlement.",
  "Audit & Compliance": "Auditoria & compliance",
  "Immutable audit trail and regulatory reporting readiness.":
    "Trilha de auditoria imutável e prontidão para relatórios regulatórios.",
  "Billing & Subscriptions": "Faturamento & assinaturas",
  "Plan billing via PIX, card and crypto (XLM / USDC), isolated from settlement.":
    "Faturamento de planos via PIX, cartão e cripto (XLM / USDC), isolado do settlement.",
  "Stellar Mainnet Integration": "Integração com a Stellar Mainnet",
  "Anchored to the public Stellar network.": "Ancorada na rede pública Stellar.",
  "~5 seconds": "~5 segundos",
  Assets: "Ativos",
  "Settlement Rail · Connected": "Settlement Rail · Conectado",
  ONLINE: "ONLINE",
  "Active network": "Rede ativa",
  "EPWR · tokenized energy receivable": "EPWR · recebível de energia tokenizado",
  "Network reserve / gas": "Reserva de rede / gas",
  "Machine payments": "Pagamentos máquina a máquina",
  "x402 (pay-per-call API)": "x402 (API paga por chamada)",
  Receipt: "Recibo",
  "Target Users": "Público-alvo",
  "Built for every role in the power market.":
    "Feito para cada papel no mercado de energia.",
  Generators: "Geradores",
  "Distribute generated energy assets and settle production obligations.":
    "Distribua ativos de energia gerada e liquide obrigações de produção.",
  "Sellers / Traders": "Vendedores / traders",
  "Register sell-side contracts and clear positions with auditable finality.":
    "Registre contratos de venda e liquide posições com finalização auditável.",
  Utilities: "Distribuidoras",
  "Reconcile distribution obligations, connections and consumption units.":
    "Reconcilie obrigações de distribuição, conexões e unidades consumidoras.",
  Investors: "Investidores",
  "Track tokenized energy receivables and settlement-backed positions.":
    "Acompanhe recebíveis de energia tokenizados e posições lastreadas em settlement.",
  Consumers: "Consumidores",
  "Settle consumption obligations against transparent on-chain receipts.":
    "Liquide obrigações de consumo contra recibos on-chain transparentes.",
  Auditability: "Auditabilidade",
  "Every settlement is independently verifiable.":
    "Cada settlement é verificável de forma independente.",
  "Deterministic txHash for each executed settlement":
    "txHash determinístico para cada settlement executado",
  "Confirmed ledger sequence on the public network":
    "Sequência de ledger confirmada na rede pública",
  "Source / destination accounts and asset amounts":
    "Contas de origem / destino e valores dos ativos",
  "One-click verification on Stellar Expert (public / mainnet)":
    "Verificação em um clique no Stellar Expert (public / mainnet)",
  "Settlement Receipt · Mainnet": "Recibo de settlement · Mainnet",
  Settled: "Liquidado",
  Asset: "Ativo",
  "Tx Hash": "Tx Hash",
  "Verify on Stellar Expert": "Verificar no Stellar Expert",
  "Settle energy markets on a rail you can audit.":
    "Liquide mercados de energia em um trilho que você pode auditar.",
  "Launch the live EnergyPay platform running on":
    "Acesse a plataforma EnergyPay ao vivo, rodando na",
  "and execute your first auditable settlement.":
    "e execute seu primeiro settlement auditável.",
  "Programmable financial rail for electricity markets":
    "Trilho financeiro programável para mercados de eletricidade",
  Platform: "Plataforma",
  Explorer: "Explorer",

  // dashboard
  "Settlement Operations": "Operações de settlement",
  "Operations Dashboard": "Painel de operações",
  "HORIZON OFFLINE": "HORIZON OFFLINE",
  "HORIZON ONLINE": "HORIZON ONLINE",
  Refresh: "Atualizar",
  Retry: "Tentar novamente",
  Settlements: "Settlements",
  confirmed: "confirmados",
  Failed: "Falhos",
  "rejected / reverted": "rejeitados / revertidos",
  "Cleared Volume": "Volume liquidado",
  "total BRL settled": "total liquidado em BRL",
  Users: "Usuários",
  counterparties: "contrapartes",
  "Avg. Finality": "Finalização média",
  OFFLINE: "OFFLINE",
  latency: "latência",
  "Platform Treasury · Live Balances": "Tesouraria da plataforma · Saldos ao vivo",
  Operator: "Operador",
  Distribution: "Distribuição",
  "EPWR Supply": "Oferta de EPWR",
  "Operational Telemetry": "Telemetria operacional",
  "Horizon latency": "Latência do Horizon",
  "Backend API": "API do backend",
  "Settlement Feed · Live": "Feed de settlement · Ao vivo",
  "Recent Transactions": "Transações recentes",
  Contracts: "Contratos",
  "No settlements recorded yet.": "Nenhum settlement registrado ainda.",
  ID: "ID",
  Seller: "Vendedor",
  Amount: "Valor",
  Status: "Status",
  When: "Quando",
  // dashboard · role context actions
  "Register Energy Contract": "Registrar contrato de energia",
  "Settlement History": "Histórico de settlement",
  "New Trade Contract": "Novo contrato de negociação",
  "Contract Registry": "Registro de contratos",
  "Settlement Analytics": "Análises de settlement",
  "Find Energy Sellers": "Encontrar vendedores de energia",
  "My Contracts": "Meus contratos",
  "Consumer Registry": "Registro de consumidores",
  "Grid Connections": "Conexões de rede",
  "TUSD Settlement": "Settlement de TUSD",
};
