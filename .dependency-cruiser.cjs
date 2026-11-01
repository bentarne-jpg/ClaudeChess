/* Layer and feature boundaries from ARCHITECTURE.md §3.2 (A1–A4, A7). */
module.exports = {
  forbidden: [
    { name: "domain-is-pure", comment: "A1: the domain imports nothing but its own files and chess.js",
      severity: "error", from: { path: "^packages/domain/src" },
      to: { pathNot: ["^packages/domain/src", "chess\\.js"] } },
    { name: "core-no-adapters-or-ui", comment: "A2: application code depends only on domain, contracts and its own ports",
      severity: "error", from: { path: "^apps/web/src/core" },
      to: { path: ["^apps/web/src/(adapters|features|ui|legacy)"] } },
    { name: "features-isolated", comment: "A4: a feature never imports another feature",
      severity: "error", from: { path: "^apps/web/src/features/([^/]+)/" },
      to: { path: "^apps/web/src/features/", pathNot: "^apps/web/src/features/$1/" } },
    { name: "no-new-legacy-dependants", comment: "R1: nothing new may depend on the legacy app",
      severity: "error", from: { path: "^apps/web/src/(core|adapters|features|ui)" },
      to: { path: "^apps/web/src/legacy" } },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "default"] },
  },
};
