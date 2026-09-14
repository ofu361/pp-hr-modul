// © 2026 P&P Group. Proprietary & Confidential.
/**
 * HR-Modul API — Mitarbeiter, Urlaub, Recruiting, Onboarding, Schulungen, Postfach
 * Thematische Submodule; die Mount-Reihenfolge entspricht der früheren
 * Definitionsreihenfolge in der Monolith-Datei (Pfad-Matching unverändert).
 */
import { Router, type IRouter } from "express";
import mitarbeiterRouter from "./mitarbeiter.js";
import recruitingRouter from "./recruiting.js";
import onboardingSchulungenRouter from "./onboarding-schulungen.js";
import postfachRouter from "./postfach.js";
import schichtenPersonalakteRouter from "./schichten-personalakte.js";
import qualifikationenRouter from "./qualifikationen.js";
import leistungZieleRouter from "./leistung-ziele.js";
import auswertungenRouter from "./auswertungen.js";
import auswertungGesellschaftRouter from "./auswertung-gesellschaft.js";
import auswertungGehaltQualifikationRouter from "./auswertung-gehalt-qualifikation.js";
import vertraegeRouter from "./vertraege.js";
import persoenlichkeitRouter from "./persoenlichkeit.js";
import marktgehaltRouter from "./marktgehalt.js";
import abwesenheitKalenderRouter from "./abwesenheit-kalender.js";
import urlaubskontoRouter from "./urlaubskonto.js";
import pflichtenRouter from "./pflichten.js";
import offboardingRouter from "./offboarding.js";
import importRouter from "./import.js";
import dokumenteRouter from "./dokumente.js";

const router: IRouter = Router();

router.use(mitarbeiterRouter);
router.use(recruitingRouter);
router.use(onboardingSchulungenRouter);
router.use(postfachRouter);
router.use(schichtenPersonalakteRouter);
router.use(qualifikationenRouter);
router.use(leistungZieleRouter);
router.use(auswertungenRouter);
router.use(auswertungGesellschaftRouter);
router.use(auswertungGehaltQualifikationRouter);
router.use(vertraegeRouter);
router.use(persoenlichkeitRouter);
router.use(marktgehaltRouter);
router.use(abwesenheitKalenderRouter);
router.use(urlaubskontoRouter);
router.use(pflichtenRouter);
router.use(offboardingRouter);
router.use(importRouter);
router.use(dokumenteRouter);

export default router;
