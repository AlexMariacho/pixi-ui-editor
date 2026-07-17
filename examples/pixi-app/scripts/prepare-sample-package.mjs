import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleDirectory = path.resolve(appDirectory, "../sample-project");
const packageDirectory = path.join(appDirectory, "public/package");

// This ignored fixture is deliberately replaceable by an unpacked editor export. It mirrors the
// authored sample byte-for-byte, including its self-contained data: font, and only exists to make
// the demo reproducible before the user's export smoke.
await rm(packageDirectory, { recursive: true, force: true });
await mkdir(packageDirectory, { recursive: true });
await cp(path.join(sampleDirectory, "assets"), path.join(packageDirectory, "assets"), { recursive: true });
await writeFile(path.join(packageDirectory, "project.json"), await readFile(path.join(sampleDirectory, "project.json")));

console.log(`Prepared sample package fixture at ${packageDirectory}`);
