import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export type Stage = "dev" | "prod";

export interface AidtrackProps extends StackProps {
  stage: Stage;
  /** Carpeta con el paquete listo para Lambda (ver scripts/package-lambda.sh). */
  appDir: string;
  /** Perfil de inferencia de Bedrock (cross-region). */
  bedrockModelId?: string;
  /** Versión de la capa pública AWS Lambda Web Adapter (ARM64). */
  webAdapterLayerVersion?: number;
  /** Habilitar Amazon Transcribe en el endpoint de voz. */
  enableTranscribe?: boolean;
}

const WEB_ADAPTER_ACCOUNT = "753240598075"; // cuenta pública oficial de AWS que publica la capa Lambda Web Adapter

export class AidtrackStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: AidtrackProps) {
    super(scope, id, props);
    const prod = props.stage === "prod";
    const modelId = props.bedrockModelId ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
    const baseModel = modelId.replace(/^(us|eu|apac|global)\./, "");

    // --- Persistencia: una sola tabla on-demand (sin costo fijo). ---
    this.table = new dynamodb.Table(this, "Table", {
      tableName: `aidtrack-${props.stage}`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: prod },
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // --- Secreto de sesión generado por AWS; nunca pasa por el repositorio ni por variables en texto plano. ---
    const authSecret = new secrets.Secret(this, "AuthSecret", {
      secretName: `aidtrack/${props.stage}/auth-secret`,
      description: "Clave HS256 para firmar sesiones de AIDTRACK",
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // --- Aplicación Next.js en Lambda (ARM64, más barato) con Lambda Web Adapter. ---
    const logGroup = new logs.LogGroup(this, "AppLogs", {
      logGroupName: `/aws/lambda/aidtrack-${props.stage}`,
      retention: prod ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const adapter = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "WebAdapter",
      `arn:aws:lambda:${this.region}:${WEB_ADAPTER_ACCOUNT}:layer:LambdaAdapterLayerArm64:${props.webAdapterLayerVersion ?? 27}`,
    );
    this.fn = new lambda.Function(this, "App", {
      functionName: `aidtrack-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "run.sh",
      code: lambda.Code.fromAsset(path.resolve(props.appDir)),
      layers: [adapter],
      memorySize: 1024,
      timeout: Duration.seconds(29),
      logGroup,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        AWS_LWA_PORT: "8080",
        AWS_LWA_READINESS_CHECK_PATH: "/login",
        PORT: "8080",
        HOSTNAME: "0.0.0.0",
        NODE_ENV: "production",
        STORAGE: "dynamo",
        DYNAMO_TABLE: this.table.tableName,
        AUTH_SECRET_ARN: authSecret.secretArn,
        AI_PROVIDER: "bedrock",
        BEDROCK_MODEL_ID: modelId,
        TRANSCRIBE: props.enableTranscribe ? "aws" : "off",
        ALLOW_DEMO_RESET: prod ? "0" : "1",
      },
    });

    // --- IAM de mínimo privilegio. ---
    this.table.grantReadWriteData(this.fn);
    authSecret.grantRead(this.fn);
    this.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "InvokeSingleBedrockModel",
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${modelId}`,
          `arn:aws:bedrock:*::foundation-model/${baseModel}`,
        ],
      }),
    );
    if (props.enableTranscribe) {
      this.fn.addToRolePolicy(new iam.PolicyStatement({ sid: "TranscribeStreaming", actions: ["transcribe:StartStreamTranscription"], resources: ["*"] }));
    }

    // --- Punto de entrada público (HTTPS). La autenticación y la autorización las aplica la propia app. ---
    const url = this.fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    // --- Observabilidad básica. ---
    const alarmCfg = { evaluationPeriods: 1, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING };
    new cloudwatch.Alarm(this, "ErrorsAlarm", {
      alarmName: `aidtrack-${props.stage}-lambda-errors`,
      metric: this.fn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      ...alarmCfg,
    });
    new cloudwatch.Alarm(this, "ThrottlesAlarm", {
      alarmName: `aidtrack-${props.stage}-lambda-throttles`,
      metric: this.fn.metricThrottles({ period: Duration.minutes(5) }),
      threshold: 1,
      ...alarmCfg,
    });
    new cloudwatch.Alarm(this, "DynamoThrottleAlarm", {
      alarmName: `aidtrack-${props.stage}-dynamo-throttles`,
      metric: this.table.metric("ThrottledRequests", { statistic: "Sum", period: Duration.minutes(5) }),
      threshold: 1,
      ...alarmCfg,
    });

    Tags.of(this).add("project", "aidtrack-ai-peru");
    Tags.of(this).add("stage", props.stage);

    new CfnOutput(this, "AppUrl", { value: url.url });
    new CfnOutput(this, "TableName", { value: this.table.tableName });
    new CfnOutput(this, "AuthSecretArn", { value: authSecret.secretArn });
  }
}
