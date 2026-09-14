// © 2026 P&P Group. Proprietary & Confidential.
// Domain: HR — Mitarbeiter, Abteilungen, ZeitMind, AufgabenMind, MorgenMind
export * from "../hr";
export * from "../departments";
export * from "../dept-knowledge";
// Die Mailbox liegt historisch in dieser Domäne („dept_*"), obwohl sie
// querschnittlich ist. `postfaecher` steht deshalb daneben und nicht in einer
// eigenen Domäne — Postfach und Mailbox getrennt zu exportieren würde nur
// verschleiern, dass sie zusammengehören (0297).
export * from "../dept-postfach";
export * from "../postfaecher";
export * from "../zeit-mind";
export * from "../aufgaben-mind";
export * from "../morgen-mind";
export * from "../department-handoffs";
