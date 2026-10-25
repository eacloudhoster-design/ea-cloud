import privacyRouter from "./privacy";
import webPushRouter from "./web-push";
import { requireAppSession } from "../middlewares/app-session";
import assistantRouter from "./assistant";
import eaModeImagesRouter from "./ea-mode-images";
import tradingActivityRouter from "./trading-activity";
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import dashboardRouter from "./dashboard";
import licensesRouter from "./licenses";
import clientsRouter from "./clients";
import superadminRouter from "./superadmin";
import appAccessRouter from "./app-access";
import easRouter from "./eas";
import symbolPairsRouter from "./symbol-pairs";
import clientAppRouter from "./client-app";
import storageRouter from "./storage";
import brokerServersRouter from "./broker-servers";
import clientSettingsRouter from "./client-settings";
import tradeSignalsRouter from "./trade-signals";
import copierRouter from "./copier";
import mt5ValidationRouter from "./mt5-validation";
import mt5ConnectRouter from "./mt5-connect";
import clientMt5Router from "./client-mt5";
import testEmailRouter from "./test-email";

import scannerAdminRouter from "./scanner-admin";
import scannerRouter from "./scanner";

const router: IRouter = Router();

// Account setup remains available before activation. Scanner is an existing
// independently entitled product and retains its own authentication/quota policy.
const setup = new Set(["/login", "/login-by-email", "/register", "/me", "/activate", "/mentor-config"]);
router.use("/app", (req, res, next) => {
  if (setup.has(req.path.replace(/\/$/, "")) || req.path === "/scanner" || req.path.startsWith("/scanner/")) { next(); return; }
  void requireAppSession(req, res, next);
});

router.use(privacyRouter);
router.use(healthRouter);
router.use(assistantRouter);
router.use(webPushRouter);
router.use(tradingActivityRouter);
router.use(scannerRouter);
router.use(scannerAdminRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(dashboardRouter);
router.use(licensesRouter);
router.use(clientsRouter);
router.use(superadminRouter);
router.use(appAccessRouter);
router.use(easRouter);
router.use(eaModeImagesRouter);
router.use(symbolPairsRouter);
router.use(clientAppRouter);
router.use(storageRouter);
router.use(brokerServersRouter);
router.use(clientSettingsRouter);
router.use(tradeSignalsRouter);
router.use(copierRouter);
router.use(mt5ValidationRouter);
router.use(mt5ConnectRouter);
router.use(clientMt5Router);
router.use(testEmailRouter);

export default router;
