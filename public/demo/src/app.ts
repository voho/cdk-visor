#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { NetworkStack } from './network-stack';
import { ApiStack } from './api-stack';

const app = new App();

const network = new NetworkStack(app, 'NetworkStack', {
  env: { account: '123456789012', region: 'eu-central-1' },
});

new ApiStack(app, 'ApiStack', {
  env: { account: '123456789012', region: 'eu-central-1' },
  vpc: network.vpc,
});

app.synth();
