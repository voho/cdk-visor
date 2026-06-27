import { describe, expect, it } from "vitest";
import { badgeFor, resourceKindOf, serviceOf } from "@/lib/icons";

describe("serviceOf / resourceKindOf", () => {
  it("extracts the service namespace", () => {
    expect(serviceOf("AWS::S3::Bucket")).toBe("S3");
    expect(serviceOf("AWS::DynamoDB::Table")).toBe("DynamoDB");
    expect(serviceOf(undefined)).toBeUndefined();
  });

  it("extracts the resource kind", () => {
    expect(resourceKindOf("AWS::S3::Bucket")).toBe("Bucket");
    expect(resourceKindOf("AWS::ApiGateway::Method")).toBe("Method");
  });
});

describe("badgeFor", () => {
  it("uses friendly labels for known services", () => {
    expect(badgeFor("resource", "AWS::S3::Bucket").label).toBe("S3");
    expect(badgeFor("resource", "AWS::Lambda::Function").label).toBe("λ");
  });

  it("derives a stable label/color for unknown services", () => {
    const a = badgeFor("resource", "AWS::Weird::Thing");
    const b = badgeFor("resource", "AWS::Weird::Thing");
    expect(a).toEqual(b);
    expect(a.label).toBe("WEI");
  });

  it("falls back to kind badges for non-resources", () => {
    expect(badgeFor("stack").label).toBe("STK");
    expect(badgeFor("app").label).toBe("APP");
  });
});
