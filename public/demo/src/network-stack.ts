import { Stack, StackProps } from 'aws-cdk-lib';
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
