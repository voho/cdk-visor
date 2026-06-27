/**
 * Build a documentation URL from a construct's jsii fully-qualified name, e.g.
 * `aws-cdk-lib.aws_s3.Bucket` -> the AWS CDK API reference page.
 */
export function docsUrlFor(fqn: string | undefined): string | undefined {
  if (!fqn) return undefined;
  const parts = fqn.split(".");
  if (parts[0] === "aws-cdk-lib") {
    // aws-cdk-lib.aws_s3.Bucket -> .../aws-cdk-lib.aws_s3.Bucket.html
    return `https://docs.aws.amazon.com/cdk/api/v2/docs/${fqn}.html`;
  }
  if (parts[0] === "constructs") {
    return "https://docs.aws.amazon.com/cdk/api/v2/docs/constructs.Construct.html";
  }
  // Third-party construct — search npm.
  return `https://www.npmjs.com/search?q=${encodeURIComponent(parts[0])}`;
}
