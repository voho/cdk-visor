/**
 * Maps CloudFormation resource types and construct kinds to a compact visual
 * identity (a short badge label + a stable color) so the canvas reads at a
 * glance. Colors are derived deterministically for unknown services.
 */
import type { NodeKind } from "@/lib/model";

export interface Badge {
  label: string;
  color: string;
}

/** Friendly badge labels for common AWS services. */
const SERVICE_LABELS: Record<string, string> = {
  S3: "S3",
  EC2: "EC2",
  Lambda: "λ",
  DynamoDB: "DDB",
  IAM: "IAM",
  SQS: "SQS",
  SNS: "SNS",
  ApiGateway: "API",
  ApiGatewayV2: "API",
  Logs: "LOG",
  KMS: "KMS",
  ECS: "ECS",
  EKS: "EKS",
  RDS: "RDS",
  CloudFront: "CF",
  Route53: "DNS",
  StepFunctions: "SFN",
  Events: "EVT",
  CloudWatch: "CW",
  Cognito: "IDP",
  SecretsManager: "SEC",
  SSM: "SSM",
  Kinesis: "KIN",
  ElastiCache: "EC",
  Athena: "ATH",
  Glue: "GLU",
};

/** Curated brand-ish colors for the most common services. */
const SERVICE_COLORS: Record<string, string> = {
  S3: "#3cb371",
  EC2: "#f58536",
  Lambda: "#f58536",
  DynamoDB: "#4d72e0",
  IAM: "#d9534f",
  SQS: "#d6649a",
  SNS: "#d6649a",
  ApiGateway: "#a166d6",
  ApiGatewayV2: "#a166d6",
  Logs: "#7a8aa0",
  KMS: "#d9534f",
  RDS: "#4d72e0",
  CloudFront: "#a166d6",
  Route53: "#3cb371",
};

const KIND_BADGES: Record<NodeKind, Badge> = {
  app: { label: "APP", color: "#4f9cf9" },
  stage: { label: "STG", color: "#22c79b" },
  stack: { label: "STK", color: "#f5a623" },
  construct: { label: "{ }", color: "#8a93a6" },
  resource: { label: "•", color: "#8a93a6" },
};

/** Service namespace from a CFN type, e.g. "AWS::S3::Bucket" -> "S3". */
export function serviceOf(cfnType: string | undefined): string | undefined {
  if (!cfnType) return undefined;
  const parts = cfnType.split("::");
  return parts.length >= 2 ? parts[1] : undefined;
}

/** Short resource name from a CFN type, e.g. "AWS::S3::Bucket" -> "Bucket". */
export function resourceKindOf(cfnType: string | undefined): string | undefined {
  if (!cfnType) return undefined;
  const parts = cfnType.split("::");
  return parts[parts.length - 1];
}

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 52% 55%)`;
}

/** Compute the badge for any node. */
export function badgeFor(kind: NodeKind, cfnType?: string): Badge {
  if (kind === "resource") {
    const service = serviceOf(cfnType);
    if (service) {
      return {
        label: SERVICE_LABELS[service] ?? service.slice(0, 3).toUpperCase(),
        color: SERVICE_COLORS[service] ?? hashColor(service),
      };
    }
  }
  return KIND_BADGES[kind];
}
