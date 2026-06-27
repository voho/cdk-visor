#!/usr/bin/env node
/**
 * Generates a small but realistic CDK cloud assembly (cdk.out) for the demo,
 * along with the matching CDK source files. Everything is derived from a single
 * in-memory definition so the construct tree, the CloudFormation templates, the
 * manifest metadata (logical ids + source traces) and the source line numbers
 * all stay consistent.
 *
 * Output: public/demo/{tree.json, manifest.json, *.template.json, src/*.ts}
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "demo");
const SRC = join(OUT, "src");
const CDK_VERSION = "2.150.0";
const ACCOUNT = "123456789012";
const REGION = "eu-central-1";

/* ----------------------------- demo source ------------------------------ */

const sources = {
  "app.ts": `#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { NetworkStack } from './network-stack';
import { ApiStack } from './api-stack';

const app = new App();

const network = new NetworkStack(app, 'NetworkStack', {
  env: { account: '${ACCOUNT}', region: '${REGION}' },
});

new ApiStack(app, 'ApiStack', {
  env: { account: '${ACCOUNT}', region: '${REGION}' },
  vpc: network.vpc,
});

app.synth();
`,
  "network-stack.ts": `import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

/**
 * Shared networking for the shop application: one VPC spanning two AZs and a
 * security group fronting the API tier.
 */
export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // A VPC with public + private subnets across two availability zones.
    this.vpc = new ec2.Vpc(this, 'ShopVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Security group that allows inbound HTTPS to the API tier.
    const apiSg = new ec2.SecurityGroup(this, 'ApiSecurityGroup', {
      vpc: this.vpc,
      description: 'Allow inbound HTTPS to the API tier',
    });
    apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
  }
}
`,
  "api-stack.ts": `import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export interface ApiStackProps extends StackProps {
  readonly vpc?: ec2.IVpc;
}

/**
 * The order-service API: a DynamoDB table, an assets bucket, a Lambda handler
 * and a REST API that fronts the handler.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: ApiStackProps) {
    super(scope, id, props);

    // Stores customer orders, keyed by order id.
    const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Holds product images and other static assets.
    const assets = new s3.Bucket(this, 'AssetsBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Lambda that implements the orders API.
    const handler = new lambda.Function(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        'exports.handler = async () => ({ statusCode: 200 });',
      ),
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: ordersTable.tableName,
        ASSETS_BUCKET: assets.bucketName,
      },
    });

    ordersTable.grantReadWriteData(handler);
    assets.grantRead(handler);

    // Public REST API in front of the Lambda handler.
    const api = new apigateway.RestApi(this, 'OrdersApi', {
      restApiName: 'Orders Service',
      deployOptions: { stageName: 'prod' },
    });
    const orders = api.root.addResource('orders');
    orders.addMethod('GET', new apigateway.LambdaIntegration(handler));
    orders.addMethod('POST', new apigateway.LambdaIntegration(handler));
  }
}
`,
};

const lineOf = (file, token) => {
  const lines = sources[file].split("\n");
  const idx = lines.findIndex((l) => l.includes(token));
  return idx === -1 ? 1 : idx + 1;
};

/* ----------------------------- definitions ------------------------------ */

const fqn = (mod, cls) => `aws-cdk-lib.${mod}.${cls}`;

// A resource node: synthesizes to CloudFormation.
const res = (id, cfnType, logicalId, props, cfnFqn, extra = {}) => ({
  id,
  cfnType,
  logicalId,
  props,
  fqn: cfnFqn,
  dependsOn: extra.dependsOn,
  children: extra.children ?? [],
});

// A logical construct node (an L2/L3 scope).
const con = (id, constructFqn, children, source) => ({
  id,
  fqn: constructFqn,
  source,
  children,
});

const network = {
  id: "NetworkStack",
  source: { token: "new NetworkStack", symbol: "App" },
  children: [
    con(
      "ShopVpc",
      fqn("aws_ec2", "Vpc"),
      [
        res("Resource", "AWS::EC2::VPC", "ShopVpcE6F71D2A", {
          CidrBlock: "10.0.0.0/16",
          EnableDnsHostnames: true,
          EnableDnsSupport: true,
          Tags: [{ Key: "Name", Value: "NetworkStack/ShopVpc" }],
        }, fqn("aws_ec2", "CfnVPC")),
        con(
          "PublicSubnet1",
          fqn("aws_ec2", "PublicSubnet"),
          [
            res("Subnet", "AWS::EC2::Subnet", "ShopVpcPublicSubnet1Subnet5C2D37C4", {
              CidrBlock: "10.0.0.0/18",
              VpcId: { Ref: "ShopVpcE6F71D2A" },
              MapPublicIpOnLaunch: true,
              AvailabilityZone: `${REGION}a`,
            }, fqn("aws_ec2", "CfnSubnet")),
            res("RouteTable", "AWS::EC2::RouteTable", "ShopVpcPublicSubnet1RouteTable6C95E38E", {
              VpcId: { Ref: "ShopVpcE6F71D2A" },
            }, fqn("aws_ec2", "CfnRouteTable")),
          ],
        ),
        con(
          "PrivateSubnet1",
          fqn("aws_ec2", "PrivateSubnet"),
          [
            res("Subnet", "AWS::EC2::Subnet", "ShopVpcPrivateSubnet1Subnet5B6ADF1D", {
              CidrBlock: "10.0.128.0/18",
              VpcId: { Ref: "ShopVpcE6F71D2A" },
              MapPublicIpOnLaunch: false,
              AvailabilityZone: `${REGION}a`,
            }, fqn("aws_ec2", "CfnSubnet")),
          ],
        ),
        res("IGW", "AWS::EC2::InternetGateway", "ShopVpcIGWB7A2F1C9", {
          Tags: [{ Key: "Name", Value: "NetworkStack/ShopVpc" }],
        }, fqn("aws_ec2", "CfnInternetGateway")),
      ],
      { file: "network-stack.ts", token: "new ec2.Vpc(this, 'ShopVpc'", symbol: "NetworkStack" },
    ),
    con(
      "ApiSecurityGroup",
      fqn("aws_ec2", "SecurityGroup"),
      [
        res("Resource", "AWS::EC2::SecurityGroup", "ApiSecurityGroupAFC9D5B2", {
          GroupDescription: "Allow inbound HTTPS to the API tier",
          VpcId: { Ref: "ShopVpcE6F71D2A" },
          SecurityGroupIngress: [
            { CidrIp: "0.0.0.0/0", FromPort: 443, ToPort: 443, IpProtocol: "tcp" },
          ],
        }, fqn("aws_ec2", "CfnSecurityGroup")),
      ],
      { file: "network-stack.ts", token: "new ec2.SecurityGroup", symbol: "NetworkStack" },
    ),
  ],
};

const api = {
  id: "ApiStack",
  source: { token: "new ApiStack", symbol: "App" },
  children: [
    con(
      "OrdersTable",
      fqn("aws_dynamodb", "Table"),
      [
        res("Resource", "AWS::DynamoDB::Table", "OrdersTable315BB997", {
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }, fqn("aws_dynamodb", "CfnTable"), { children: [] }),
      ],
      { file: "api-stack.ts", token: "new dynamodb.Table", symbol: "ApiStack" },
    ),
    con(
      "AssetsBucket",
      fqn("aws_s3", "Bucket"),
      [
        res("Resource", "AWS::S3::Bucket", "AssetsBucket1B2C3D4E", {
          VersioningConfiguration: { Status: "Enabled" },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
            ],
          },
        }, fqn("aws_s3", "CfnBucket")),
      ],
      { file: "api-stack.ts", token: "new s3.Bucket", symbol: "ApiStack" },
    ),
    con(
      "OrderHandler",
      fqn("aws_lambda", "Function"),
      [
        con(
          "ServiceRole",
          fqn("aws_iam", "Role"),
          [
            res("Resource", "AWS::IAM::Role", "OrderHandlerServiceRole8E8B448D", {
              AssumeRolePolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Principal: { Service: "lambda.amazonaws.com" },
                  },
                ],
              },
              ManagedPolicyArns: [
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            }, fqn("aws_iam", "CfnRole")),
          ],
        ),
        res("Resource", "AWS::Lambda::Function", "OrderHandler9F8E7D6C", {
          Runtime: "nodejs20.x",
          Handler: "index.handler",
          Timeout: 10,
          Code: { ZipFile: "exports.handler = async () => ({ statusCode: 200 });" },
          Role: { "Fn::GetAtt": ["OrderHandlerServiceRole8E8B448D", "Arn"] },
          Environment: {
            Variables: {
              TABLE_NAME: { Ref: "OrdersTable315BB997" },
              ASSETS_BUCKET: { Ref: "AssetsBucket1B2C3D4E" },
            },
          },
        }, fqn("aws_lambda", "CfnFunction"), {
          dependsOn: ["OrderHandlerServiceRole8E8B448D"],
        }),
      ],
      { file: "api-stack.ts", token: "new lambda.Function", symbol: "ApiStack" },
    ),
    con(
      "OrdersApi",
      fqn("aws_apigateway", "RestApi"),
      [
        res("Resource", "AWS::ApiGateway::RestApi", "OrdersApiC1A2B3D4", {
          Name: "Orders Service",
        }, fqn("aws_apigateway", "CfnRestApi")),
        con(
          "Deployment",
          fqn("aws_apigateway", "Deployment"),
          [
            res("Resource", "AWS::ApiGateway::Deployment", "OrdersApiDeploymentE5F6A7B8", {
              RestApiId: { Ref: "OrdersApiC1A2B3D4" },
              Description: "Automatically created by the RestApi construct",
            }, fqn("aws_apigateway", "CfnDeployment")),
          ],
        ),
        con(
          "DeploymentStage.prod",
          fqn("aws_apigateway", "Stage"),
          [
            res("Resource", "AWS::ApiGateway::Stage", "OrdersApiDeploymentStageprod9C8D7E6F", {
              RestApiId: { Ref: "OrdersApiC1A2B3D4" },
              DeploymentId: { Ref: "OrdersApiDeploymentE5F6A7B8" },
              StageName: "prod",
            }, fqn("aws_apigateway", "CfnStage")),
          ],
        ),
        con(
          "orders",
          fqn("aws_apigateway", "Resource"),
          [
            res("Resource", "AWS::ApiGateway::Resource", "OrdersApiordersA1B2C3D4", {
              ParentId: { "Fn::GetAtt": ["OrdersApiC1A2B3D4", "RootResourceId"] },
              PathPart: "orders",
              RestApiId: { Ref: "OrdersApiC1A2B3D4" },
            }, fqn("aws_apigateway", "CfnResource")),
            con(
              "GET",
              fqn("aws_apigateway", "Method"),
              [
                res("Resource", "AWS::ApiGateway::Method", "OrdersApiordersGETF1E2D3C4", {
                  HttpMethod: "GET",
                  ResourceId: { Ref: "OrdersApiordersA1B2C3D4" },
                  RestApiId: { Ref: "OrdersApiC1A2B3D4" },
                  AuthorizationType: "NONE",
                }, fqn("aws_apigateway", "CfnMethod")),
              ],
            ),
            con(
              "POST",
              fqn("aws_apigateway", "Method"),
              [
                res("Resource", "AWS::ApiGateway::Method", "OrdersApiordersPOSTA5B6C7D8", {
                  HttpMethod: "POST",
                  ResourceId: { Ref: "OrdersApiordersA1B2C3D4" },
                  RestApiId: { Ref: "OrdersApiC1A2B3D4" },
                  AuthorizationType: "NONE",
                }, fqn("aws_apigateway", "CfnMethod")),
              ],
            ),
          ],
        ),
      ],
      { file: "api-stack.ts", token: "new apigateway.RestApi", symbol: "ApiStack" },
    ),
  ],
};

const STACKS = [network, api];

/* ----------------------------- generation ------------------------------- */

const cfnShort = (cfnType) => "Cfn" + cfnType.split("::").pop();

function buildTrace(source) {
  if (!source) return undefined;
  const frames = [];
  frames.push(
    `    at Function.synth (/asset/node_modules/aws-cdk-lib/core/lib/cfn-resource.ts:312:23)`,
  );
  frames.push(
    `    at new ${source.symbol} (/asset/src/${source.file}:${lineOf(
      source.file,
      source.token,
    )}:21)`,
  );
  if (source.symbol !== "App") {
    frames.push(
      `    at Object.<anonymous> (/asset/src/app.ts:${lineOf(
        "app.ts",
        `new ${source.symbol}`,
      )}:1)`,
    );
  }
  return frames;
}

function walk(node, parentPath, source, ctx) {
  const path = parentPath ? `${parentPath}/${node.id}` : node.id;
  const effectiveSource = node.source
    ? { ...node.source, file: node.source.file ?? source?.file }
    : source;

  const treeNode = { id: node.id, path };

  if (node.cfnType) {
    treeNode.attributes = {
      "aws:cdk:cloudformation:type": node.cfnType,
      "aws:cdk:cloudformation:props": node.props ?? {},
    };
    treeNode.constructInfo = { fqn: node.fqn, version: CDK_VERSION };

    // Template resource.
    const resource = {
      Type: node.cfnType,
      Properties: node.props ?? {},
      Metadata: { "aws:cdk:path": path },
    };
    if (node.dependsOn) resource.DependsOn = node.dependsOn;
    ctx.template.Resources[node.logicalId] = resource;

    // Manifest metadata (logical id + trace).
    ctx.metadata[`/${path}`] = [
      { type: "aws:cdk:logicalId", data: node.logicalId, trace: buildTrace(effectiveSource) },
    ];
  } else if (node.fqn) {
    treeNode.constructInfo = { fqn: node.fqn, version: CDK_VERSION };
  }

  const children = node.children ?? [];
  if (children.length) {
    treeNode.children = {};
    for (const child of children) {
      treeNode.children[child.id] = walk(child, path, effectiveSource, ctx);
    }
  }
  return treeNode;
}

function buildStack(stack) {
  const template = {
    Resources: {},
    Outputs: {
      ...(stack.id === "ApiStack"
        ? {
            OrdersApiEndpoint: {
              Description: "Base URL of the Orders REST API",
              Value: {
                "Fn::Join": [
                  "",
                  [
                    "https://",
                    { Ref: "OrdersApiC1A2B3D4" },
                    `.execute-api.${REGION}.amazonaws.com/prod/`,
                  ],
                ],
              },
            },
          }
        : {}),
    },
  };
  const metadata = {};
  const ctx = { template, metadata };

  const stackTreeChildren = {};
  for (const child of stack.children) {
    // Top-level constructs in a stack carry their source for traces.
    const src = child.source
      ? { ...child.source, symbolStack: stack.id }
      : undefined;
    stackTreeChildren[child.id] = walk(child, stack.id, src, ctx);
  }

  const stackTreeNode = {
    id: stack.id,
    path: stack.id,
    constructInfo: { fqn: "aws-cdk-lib.Stack", version: CDK_VERSION },
    children: stackTreeChildren,
  };

  return { template, metadata, stackTreeNode };
}

function main() {
  mkdirSync(SRC, { recursive: true });

  const treeChildren = {};
  const manifestArtifacts = {};

  for (const stack of STACKS) {
    const { template, metadata, stackTreeNode } = buildStack(stack);
    const templateFile = `${stack.id}.template.json`;
    writeFileSync(join(OUT, templateFile), JSON.stringify(template, null, 1));

    treeChildren[stack.id] = stackTreeNode;
    manifestArtifacts[stack.id] = {
      type: "aws:cloudformation:stack",
      environment: `aws://${ACCOUNT}/${REGION}`,
      properties: {
        templateFile,
        validateOnSynth: false,
      },
      displayName: stack.id,
      metadata,
    };
  }

  // The tree artifact pointer.
  manifestArtifacts["Tree"] = {
    type: "cdk:tree",
    properties: { file: "tree.json" },
  };

  const tree = {
    version: "tree-0.1",
    tree: {
      id: "App",
      path: "",
      constructInfo: { fqn: "aws-cdk-lib.App", version: CDK_VERSION },
      children: {
        ...treeChildren,
        Tree: {
          id: "Tree",
          path: "Tree",
          constructInfo: { fqn: "constructs.Construct", version: "10.3.0" },
        },
      },
    },
  };

  const manifest = {
    version: "39.0.0",
    artifacts: manifestArtifacts,
  };

  writeFileSync(join(OUT, "tree.json"), JSON.stringify(tree, null, 1));
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

  for (const [name, content] of Object.entries(sources)) {
    writeFileSync(join(SRC, name), content);
  }

  const resourceCount = STACKS.reduce((acc, s) => {
    const count = (n) =>
      (n.cfnType ? 1 : 0) + (n.children ?? []).reduce((a, c) => a + count(c), 0);
    return acc + s.children.reduce((a, c) => a + count(c), 0);
  }, 0);

  console.log(
    `Generated demo cloud assembly in ${OUT}\n` +
      `  ${STACKS.length} stacks, ${resourceCount} resources, ${Object.keys(sources).length} source files`,
  );
}

main();
