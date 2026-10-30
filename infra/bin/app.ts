import * as path from "node:path";
import { App } from "aws-cdk-lib";
import { AidtrackStack, type Stage } from "../lib/aidtrack-stack";

const app = new App();
const stage = (app.node.tryGetContext("stage") ?? "dev") as Stage;
if (stage !== "dev" && stage !== "prod") throw new Error("stage debe ser dev o prod (-c stage=dev)");

new AidtrackStack(app, `Aidtrack-${stage}`, {
  stage,
  // El paquete se genera con `npm run package:lambda` en la raíz del proyecto.
  appDir: path.join(__dirname, "..", "..", ".lambda-package"),
  enableTranscribe: app.node.tryGetContext("transcribe") === "true",
  // La cuenta y región se toman de las credenciales activas; nunca se escriben en el repositorio.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
});
