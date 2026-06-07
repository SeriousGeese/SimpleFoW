# Contributing to SimpleFoW

Thanks for your interest in contributing! This is a small, focused tool — keep that spirit in mind when proposing changes.

## Getting started

```bash
git clone https://github.com/strickdd/SimpleFoW.git
cd SimpleFoW
npm install
npm run dev
```

The dev server starts at `http://localhost:3014` with hot reload.

## Opening issues

- **Bug reports** — include browser/version, steps to reproduce, and what you expected vs. what happened.
- **Feature requests** — explain the use-case first. Prefer small, composable additions over large new modes.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Keep changes focused — one logical change per PR.
3. Test manually in the browser (there is no automated test suite).
4. Make sure `npm run build` succeeds with no errors before opening the PR.
5. Write a clear PR description: what changed and why.

## Code style

- Vanilla JS ES modules — no framework, no TypeScript.
- Prefer small, single-responsibility modules.
- Comments only where the *why* is non-obvious.
- Run `npm run build` to catch any bundler errors before pushing.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
