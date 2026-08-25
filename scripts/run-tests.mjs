#!/usr/bin/env node
// Runs the TypeScript tests with Node's built-in test runner.
// Compiles the needed sources into .test-build/ first, since the project
// has no test bundler installed.
import { execSync } from "node:child_process";
import { rmSync, cpSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, ".test-build");

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir);

const sources = ["src/utils/obex.ts", "src/tests/obex.test.ts"];
execSync(`npx tsc ${sources.join(" ")} --outDir ${buildDir} ` +
	"--module esnext --target esnext --moduleResolution bundler --skipLibCheck --esModuleInterop --strict",
	{ stdio: "inherit", cwd: root });

// tsc emits obex.js / obex.test.js next to each other; run node's test runner
execSync("node --test --test-reporter spec .test-build/tests/obex.test.js", { stdio: "inherit", cwd: root });

if (!existsSync(path.join(buildDir, "keep")))
	rmSync(buildDir, { recursive: true, force: true });
