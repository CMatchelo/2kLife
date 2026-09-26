import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { migrateLegacyData } from "./data-directory.ts";

test("desktop data migration copies a consistent database and never overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "2klife-data-migration-"));
  const legacy = join(root, "legacy");
  const destination = join(root, "desktop");
  await mkdir(join(legacy, "signature-shoes"), { recursive: true });

  const source = new DatabaseSync(join(legacy, "careers.sqlite"));
  source.exec("CREATE TABLE value (text TEXT); INSERT INTO value VALUES ('legacy')");
  source.close();
  await writeFile(join(legacy, "settings.json"), '{"selectedProvider":"codex"}');
  await writeFile(join(legacy, "signature-shoes", "shoe.png"), "image");

  try {
    assert.deepEqual(await migrateLegacyData(legacy, destination), {
      database: true,
      settings: true,
      signatureShoes: true,
    });
    const migrated = new DatabaseSync(join(destination, "careers.sqlite"));
    assert.equal(
      (migrated.prepare("SELECT text FROM value").get() as { text: string }).text,
      "legacy",
    );
    migrated.close();
    assert.equal(
      await readFile(join(destination, "settings.json"), "utf8"),
      '{"selectedProvider":"codex"}',
    );
    assert.equal(
      await readFile(join(destination, "signature-shoes", "shoe.png"), "utf8"),
      "image",
    );

    await writeFile(join(destination, "settings.json"), "desktop settings");
    assert.deepEqual(await migrateLegacyData(legacy, destination), {
      database: false,
      settings: false,
      signatureShoes: false,
    });
    assert.equal(
      await readFile(join(destination, "settings.json"), "utf8"),
      "desktop settings",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
