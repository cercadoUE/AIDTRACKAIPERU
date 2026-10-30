import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { AidtrackStack } from "../lib/aidtrack-stack";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidtrack-app-"));
  fs.writeFileSync(path.join(dir, "run.sh"), "#!/bin/sh\nexec node server.js\n");
});
const synth = (stage: "dev" | "prod", transcribe = false) => {
  const app = new App();
  const stack = new AidtrackStack(app, "T", { stage, appDir: dir, enableTranscribe: transcribe, env: { account: "111111111111", region: "us-east-1" } });
  return Template.fromStack(stack);
};

describe("AidtrackStack", () => {
  it("tabla DynamoDB on-demand con clave pk/sk", () => {
    synth("dev").hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
    });
  });

  it("prod protege los datos; dev es desechable", () => {
    synth("prod").hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Retain", Properties: { DeletionProtectionEnabled: true, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } } });
    synth("dev").hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Delete" });
  });

  it("Lambda ARM64 con el secreto en Secrets Manager y sin secretos en texto plano", () => {
    const t = synth("dev");
    t.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Environment: { Variables: Match.objectLike({ STORAGE: "dynamo", AI_PROVIDER: "bedrock", AUTH_SECRET_ARN: Match.anyValue() }) },
    });
    const fn = Object.values(t.findResources("AWS::Lambda::Function"))[0] as { Properties: { Environment: { Variables: Record<string, unknown> } } };
    expect(Object.keys(fn.Properties.Environment.Variables)).not.toContain("AUTH_SECRET");
    expect(JSON.stringify(fn)).not.toMatch(/AKIA|ASIA|aws_secret/i);
  });

  it("IAM acotado: Bedrock a un solo modelo y sin comodines de acción", () => {
    const t = synth("dev");
    const policies = Object.values(t.findResources("AWS::IAM::Policy")) as { Properties: { PolicyDocument: { Statement: { Action: string | string[]; Resource: unknown }[] } } }[];
    const stmts = policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
    const bedrock = stmts.find((s) => JSON.stringify(s.Action).includes("bedrock:InvokeModel"))!;
    expect(JSON.stringify(bedrock.Resource)).toContain("claude-haiku-4-5");
    expect(JSON.stringify(bedrock.Resource)).not.toContain('"*"');
    for (const s of stmts) expect(JSON.stringify(s.Action)).not.toMatch(/"\*"|:\*"/);
  });

  it("Transcribe solo se concede si se habilita", () => {
    expect(JSON.stringify(synth("dev").toJSON())).not.toContain("transcribe:StartStreamTranscription");
    expect(JSON.stringify(synth("dev", true).toJSON())).toContain("transcribe:StartStreamTranscription");
  });

  it("alarmas y retención de logs configuradas", () => {
    const t = synth("prod");
    t.resourceCountIs("AWS::CloudWatch::Alarm", 3);
    t.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 30 });
  });

  it("no crea recursos costosos innecesarios", () => {
    const t = synth("prod");
    for (const type of ["AWS::EC2::NatGateway", "AWS::RDS::DBInstance", "AWS::ElasticLoadBalancingV2::LoadBalancer", "AWS::EC2::VPC", "AWS::S3::Bucket"]) t.resourceCountIs(type, 0);
  });
});
