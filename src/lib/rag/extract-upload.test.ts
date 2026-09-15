import assert from "node:assert/strict";
import { test } from "node:test";
import { extractUploadedFile, titleFromFilename } from "./extract-upload.ts";

test("extracts utf-8 markdown", () => {
  const text = extractUploadedFile(
    "leave-policy.md",
    Buffer.from("## Leave\nNorthstar provides 16 weeks of parental leave.\n", "utf8"),
  );
  assert.match(text, /16 weeks/);
});

test("extracts uncompressed PDF text operators", () => {
  const pdf = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj
4 0 obj<</Length 90>>stream
BT /F1 12 Tf 20 100 Td (Northstar travel economy is required under six hours.) Tj ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
`;
  const text = extractUploadedFile("travel.pdf", Buffer.from(pdf, "latin1"));
  assert.match(text, /economy is required/i);
});

test("rejects unknown types", () => {
  assert.throws(() => extractUploadedFile("photo.png", Buffer.from("xx")), /Unsupported type/);
});

test("title from filename", () => {
  assert.equal(titleFromFilename("HR-LEAVE-POLICY-v4.pdf"), "HR LEAVE POLICY v4");
});
