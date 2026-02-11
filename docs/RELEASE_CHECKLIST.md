# Release Checklist

## Pre-Release Checks

- [ ] Tests are green on GitHub CI
- [ ] Run build locally (`npm run build`)
- [ ] Run tests locally (`npm run test:unit`)
- [ ] Changelog version has been increased
- [ ] Changelog entries for the new version are written

## Release Steps

Use the release script which handles version bumping, SERVER_VERSION sync, tagging, and pushing:

```bash
./scripts/publish-release.sh
```

The script will:
1. Bump `package.json` version (patch/minor/major)
2. Sync `SERVER_VERSION` in `src/server.ts`
3. Prompt you to update `CHANGELOG.md`
4. Commit, tag, and push
5. Create a GitHub Release

CI automatically publishes to npm when it detects a `v*` tag.

## Post-Release

- [ ] Test the new version with: `npx @pandysp/claude-code-mcp@latest`
- [ ] Update any documentation if needed
- [ ] Announce the release if significant
