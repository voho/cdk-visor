import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
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
