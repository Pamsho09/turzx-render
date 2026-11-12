# Publishing turzx-render to npm

GitHub releases and npm registry releases are separate. The package is currently
installable from GitHub; publishing it to npm enables `npm install turzx-render`.

## First registry release

1. Use Node 24. Create an npm account if needed and configure two-factor
   authentication. A GitHub login does not authenticate the npm CLI.
2. Sign in and check the registry identity:

   ```bash
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   npm view turzx-render name version --registry=https://registry.npmjs.org/
   ```

   An E404 means no public package was found under that name; it is not a reservation
   or a guarantee npm will accept the name. If another owner has claimed it, choose
   a scoped name you control and update imports and documentation before publishing.
3. Build, check and inspect the exact package contents:

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run build
   npm pack --dry-run
   npm publish --dry-run --access public
   ```

4. Review the package name, version, README, license and file list. Then publish:

   ```bash
   npm publish --access public --registry=https://registry.npmjs.org/
   ```

   Complete npm's authentication/2FA prompts yourself. Do not commit credentials or
   paste one-time codes into repository files. Verify the result:

   ```bash
   npm view turzx-render version dist-tags --registry=https://registry.npmjs.org/
   ```

5. In a fresh project, install `turzx-render` from the registry. Update the README's
   installation section only after the registry package is available.

Official guide: [Creating and publishing unscoped public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).

## Later releases and GitHub Actions

Use a new version for every registry release. Keep the Git tag, GitHub release and
package version consistent; do not overwrite an existing release's artifacts.

For future CI publishing, npm supports **trusted publishing with OIDC**, avoiding
stored long-lived npm tokens. Configure the package's trusted publisher settings
for GitHub owner `Pamsho09`, repository `turzx-render`, and the exact publishing
workflow filename. That workflow must exist before configuring the trust.

The current `ci.yml` only checks code; it does not publish. Trusted publishing
requires npm CLI **11.5.1+**, Node **22.14.0+**, and a supported hosted runner.
Follow the current official workflow and permission instructions when enabling it:
[Trusted publishing](https://docs.npmjs.com/trusted-publishers/).
