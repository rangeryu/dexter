#!/usr/bin/env bun
import { config } from 'dotenv';
import { runCli } from './cli.js';

// Load local .env first so project-scoped keys win over shell-global keys.
config({ override: true, quiet: true });

await runCli();
