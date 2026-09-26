import {
  copyFile,
  cp,
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

async function exists(path: string) {
  return stat(path).then(() => true).catch(() => false);
}

async function copyFileAtomically(source: string, destination: string) {
  if (!(await exists(source)) || (await exists(destination))) return false;
  const temporary = `${destination}.migration-tmp`;
  await rm(temporary, { force: true });
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function backupDatabase(source: string, destination: string) {
  if (!(await exists(source)) || (await exists(destination))) return false;
  const temporary = `${destination}.migration-tmp`;
  await rm(temporary, { force: true });
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(database, temporary);
    await rename(temporary, destination);
    return true;
  } finally {
    database.close();
    await rm(temporary, { force: true });
  }
}

export type DataMigrationResult = {
  database: boolean;
  settings: boolean;
  signatureShoes: boolean;
};

export async function migrateLegacyData(
  legacyDirectory: string,
  destinationDirectory: string,
): Promise<DataMigrationResult> {
  const result: DataMigrationResult = {
    database: false,
    settings: false,
    signatureShoes: false,
  };
  if (resolve(legacyDirectory) === resolve(destinationDirectory)) return result;

  await mkdir(destinationDirectory, { recursive: true });
  result.database = await backupDatabase(
    join(legacyDirectory, "careers.sqlite"),
    join(destinationDirectory, "careers.sqlite"),
  );
  result.settings = await copyFileAtomically(
    join(legacyDirectory, "settings.json"),
    join(destinationDirectory, "settings.json"),
  );

  const sourceShoes = join(legacyDirectory, "signature-shoes");
  const destinationShoes = join(destinationDirectory, "signature-shoes");
  if ((await exists(sourceShoes)) && !(await exists(destinationShoes))) {
    const temporary = `${destinationShoes}.migration-tmp`;
    await rm(temporary, { recursive: true, force: true });
    try {
      await cp(sourceShoes, temporary, { recursive: true, errorOnExist: true });
      await rename(temporary, destinationShoes);
      result.signatureShoes = true;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  return result;
}
