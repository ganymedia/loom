import { expect, test } from "bun:test";
import { LOOM_VERSION } from "@loom/version";
import packageJson from "../package.json";

test("uses package.json as the package version source", () => {
  expect(LOOM_VERSION).toBe(packageJson.version);
});
