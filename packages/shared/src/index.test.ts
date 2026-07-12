import { expect, test } from "vitest";

import { workspaceName } from "./index.js";

test("exposes the shared workspace entry point", () => {
  expect(workspaceName).toBe("shared");
});
