/**
 * EnergyPay service layer — adapter façade.
 *
 * Each domain exposes `{ list, get, subscribe }`. Services pull live data
 * from the EnergyPay backend API and Stellar Mainnet Horizon. All data
 * is real — no synthetic or simulated records.
 *
 * The `subscribe` method returns an unsubscribe function that cleans up
 * polling intervals when the consuming component unmounts.
 */
export * from "./settlements.service";
export * from "./clearing.service";
export * from "./reconciliation.service";
export * from "./oracle.service";
export * from "./risk.service";
export * from "./audit.service";
export * from "./treasury.service";
export * from "./topology.service";
