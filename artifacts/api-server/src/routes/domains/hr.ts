// © 2026 P&P Group. Proprietary & Confidential.
// Domain-Router: HR — Mitarbeiter, Abteilungen, ZeitMind, AufgabenMind, MorgenMind
import { Router } from "express";
import { requirePlanModuleFor } from "../../lib/plan-features.js";
import hrRouter           from "../internal/hr/index.js";
import departmentsRouter  from "../internal/departments.js";
import zeitMindRouter     from "../internal/zeit-mind/index.js";
import aufgabenMindRouter from "../internal/aufgaben-mind.js";
import morgenMindRouter   from "../internal/morgen-mind.js";
import handoffsRouter     from "../internal/department-handoffs.js";
import { requireNavStufe } from "../../middlewares/nav-stufe.js";

const router = Router();
router.use(hrRouter);
router.use(departmentsRouter);
router.use(requirePlanModuleFor(["/zeit"], "zeit_mind"), zeitMindRouter);
router.use(aufgabenMindRouter);
// Präfix-Schranke der umgestellten Fläche (UMGESTELLT in stufen.ts).
router.use("/briefing/config",     requireNavStufe("briefing"));
router.use("/briefing/historie",   requireNavStufe("briefing"));
router.use("/briefing/vorschau",   requireNavStufe("briefing"));
router.use(morgenMindRouter);
router.use(handoffsRouter);

export default router;
