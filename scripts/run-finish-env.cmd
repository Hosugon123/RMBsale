@echo off
cd /d "%~dp0.."
npx.cmd tsx scripts/finish-vercel-env.ts %*
