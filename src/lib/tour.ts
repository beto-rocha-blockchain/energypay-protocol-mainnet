/**
 * EnergyPay onboarding guided tour.
 *
 * Floating coach-mark bubbles (driver.js) that point at exactly where the
 * user must click or type — first on the login screen, then field by field
 * through the 4-step registration wizard.
 *
 * The register tour is a single continuous tour that advances the wizard
 * itself: when the bubble crosses from one wizard step to the next, it flips
 * `formStep` (via the injected setter) and then highlights the next step's
 * field once React has rendered it.
 */
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

export const LOGIN_TOUR_KEY = "ep_tour_login_v1";
export const REGISTER_TOUR_KEY = "ep_tour_register_v1";

/** Only one tour may run at a time — destroy any previous instance first. */
let active: Driver | null = null;

function destroyActive() {
  try {
    active?.destroy();
  } catch {
    /* noop */
  }
  active = null;
}

export function hasSeenTour(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* noop */
  }
}

const SHARED = {
  showProgress: true,
  allowClose: true,
  overlayColor: "rgba(2, 6, 12, 0.72)",
  stagePadding: 6,
  stageRadius: 8,
  popoverClass: "ep-tour",
  nextBtnText: "Próximo →",
  prevBtnText: "← Voltar",
  doneBtnText: "Concluir",
  progressText: "{{current}} de {{total}}",
} as const;

/* ─────────────────────────── Login tour ─────────────────────────── */

export function startLoginTour(): Driver {
  destroyActive();
  const d = driver({
    ...SHARED,
    doneBtnText: "Entendi",
    steps: [
      {
        element: '[data-tour="login-email"]',
        popover: {
          title: "1 · Seu e-mail",
          description:
            "Digite aqui o e-mail que você cadastrou. É com ele que você entra na plataforma.",
        },
      },
      {
        element: '[data-tour="login-password"]',
        popover: {
          title: "2 · Sua senha",
          description: "Digite a senha criada no cadastro.",
        },
      },
      {
        element: '[data-tour="login-access"]',
        popover: {
          title: "3 · Entrar",
          description:
            "Clique aqui para acessar o ambiente. Pronto — você está dentro da plataforma.",
        },
      },
      {
        element: '[data-tour="login-provision"]',
        popover: {
          title: "Primeira vez aqui?",
          description:
            "Ainda não tem conta? Clique aqui para criar a sua — vamos te guiar passo a passo no cadastro.",
        },
      },
    ],
    onDestroyed: () => {
      markSeen(LOGIN_TOUR_KEY);
      active = null;
    },
  });
  active = d;
  d.drive();
  return d;
}

/* ──────────────────────── Registration tour ─────────────────────── */

type RegStep = DriveStep & { page: number };

const REGISTER_STEPS: RegStep[] = [
  // ── Step 1 · Credentials ──
  {
    page: 0,
    element: '[data-tour="reg-fullname"]',
    popover: {
      title: "Etapa 1 · Credenciais",
      description:
        "Comece pelo seu nome completo. Preencha cada campo seguindo as dicas e avance no “Próximo”.",
    },
  },
  {
    page: 0,
    element: '[data-tour="reg-email"]',
    popover: {
      title: "E-mail de acesso",
      description:
        "Use um e-mail válido — você receberá um link de confirmação nele ao final do cadastro.",
    },
  },
  {
    page: 0,
    element: '[data-tour="reg-phone"]',
    popover: {
      title: "Telefone",
      description: "Inclua o código do país, ex.: +55 11 99999-9999.",
    },
  },
  {
    page: 0,
    element: '[data-tour="reg-password"]',
    popover: {
      title: "Senha",
      description: "Crie uma senha com no mínimo 6 caracteres. Use o ícone de olho para conferir.",
    },
  },
  // ── Step 2 · Organization & identity ──
  {
    page: 1,
    element: '[data-tour="reg-org"]',
    popover: {
      title: "Etapa 2 · Organização",
      description: "Informe o nome da sua empresa ou organização.",
    },
  },
  {
    page: 1,
    element: '[data-tour="reg-country"]',
    popover: {
      title: "Localização",
      description:
        "Selecione país, estado e cidade. As opções aparecem conforme o país escolhido.",
    },
  },
  {
    page: 1,
    element: '[data-tour="reg-identity"]',
    popover: {
      title: "Documento (opcional)",
      description:
        "CPF/CNPJ é opcional. Se quiser, anexe um PDF do documento — também opcional.",
    },
  },
  // ── Step 3 · Market roles ──
  {
    page: 2,
    element: '[data-tour="reg-roles"]',
    popover: {
      title: "Etapa 3 · Papéis no mercado",
      description:
        "Escolha um ou mais papéis (ex.: Gerador, Trader, Consumidor). Eles definem o que você pode fazer na plataforma.",
    },
  },
  // ── Step 4 · Settlement setup ──
  {
    page: 3,
    element: '[data-tour="reg-wallet"]',
    popover: {
      title: "Etapa 4 · Carteira de liquidação",
      description:
        "“Managed” = a EnergyPay cuida da carteira para você (recomendado). “Link” = você usa sua própria carteira Stellar.",
    },
  },
  {
    page: 3,
    element: '[data-tour="reg-fund"]',
    popover: {
      title: "Financiar a conta",
      description:
        "Deixe marcado para provisionar sua conta na rede Stellar — necessário para operar.",
    },
  },
  {
    page: 3,
    element: '[data-tour="reg-continue"]',
    popover: {
      title: "Concluir cadastro",
      description:
        "Revise os campos e clique aqui para provisionar sua identidade. Depois, confirme seu e-mail e pronto!",
    },
  },
];

/** Delay (ms) to let React render the next wizard step before highlighting. */
const PAGE_FLIP_DELAY = 220;

export function startRegisterTour({
  setStep,
  onClose,
}: {
  setStep: (step: number) => void;
  onClose?: () => void;
}): Driver {
  destroyActive();

  const cleanSteps: DriveStep[] = REGISTER_STEPS.map((s) => ({
    element: s.element,
    popover: s.popover,
  }));
  const holder: { d: Driver | null } = { d: null };

  holder.d = driver({
    ...SHARED,
    steps: cleanSteps,
    onNextClick: () => {
      const d = holder.d;
      if (!d) return;
      const i = d.getActiveIndex() ?? 0;
      const cur = REGISTER_STEPS[i];
      const nxt = REGISTER_STEPS[i + 1];
      if (nxt && cur && nxt.page !== cur.page) {
        setStep(nxt.page);
        window.setTimeout(() => d.moveNext(), PAGE_FLIP_DELAY);
      } else {
        d.moveNext();
      }
    },
    onPrevClick: () => {
      const d = holder.d;
      if (!d) return;
      const i = d.getActiveIndex() ?? 0;
      const cur = REGISTER_STEPS[i];
      const prv = REGISTER_STEPS[i - 1];
      if (prv && cur && prv.page !== cur.page) {
        setStep(prv.page);
        window.setTimeout(() => d.movePrevious(), PAGE_FLIP_DELAY);
      } else {
        d.movePrevious();
      }
    },
    onDestroyed: () => {
      markSeen(REGISTER_TOUR_KEY);
      active = null;
      onClose?.();
    },
  });

  active = holder.d;
  // Always begin from the first wizard step, then start once it has painted.
  setStep(0);
  window.setTimeout(() => holder.d?.drive(), 80);
  return holder.d;
}
