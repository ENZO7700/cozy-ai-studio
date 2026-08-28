/**
 * G1 → Preview contract: validated multi-file patches before HitL / WC write.
 */

export type FilePatchOp = "write" | "create" | "delete";

export type FilePatch = {
  path: string;
  content: string;
  op: FilePatchOp;
  language?: string;
};

export type PatchValidationIssue = {
  path: string;
  code:
    | "EMPTY_PATH"
    | "PATH_TRAVERSAL"
    | "ABSOLUTE_PATH"
    | "BAD_EXTENSION"
    | "TOO_LARGE"
    | "TOO_MANY_FILES"
    | "INVALID_OP"
    | "BINARY_LIKE"
    | "EMPTY_CONTENT";
  message: string;
  severity: "error" | "warn";
};

export type PatchValidationResult = {
  ok: boolean;
  patches: FilePatch[];
  issues: PatchValidationIssue[];
  stats: {
    files: number;
    bytes: number;
    rejected: number;
  };
};

const MAX_FILES = 40;
const MAX_FILE_BYTES = 400_000; // ~400KB per file
const MAX_TOTAL_BYTES = 2_000_000;

const ALLOWED_EXT =
  /\.(tsx?|jsx?|mjs|cjs|css|scss|html?|json|md|svg|txt|yml|yaml|toml|env\.example)$/i;

function normalizePath(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

function isPathSafe(path: string): PatchValidationIssue | null {
  if (!path) {
    return {
      path: path || "(empty)",
      code: "EMPTY_PATH",
      message: "Empty file path",
      severity: "error",
    };
  }
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    return {
      path,
      code: "ABSOLUTE_PATH",
      message: "Absolute paths are not allowed",
      severity: "error",
    };
  }
  if (path.includes("..") || path.includes("\0")) {
    return {
      path,
      code: "PATH_TRAVERSAL",
      message: "Path traversal blocked",
      severity: "error",
    };
  }
  // allow extensionless only for known names
  const base = path.split("/").pop() ?? path;
  if (
    !ALLOWED_EXT.test(path) &&
    !/^(package\.json|tsconfig\.json|vite\.config\.(ts|js)|index\.html|Dockerfile|README\.md)$/i.test(
      base,
    )
  ) {
    return {
      path,
      code: "BAD_EXTENSION",
      message: `Disallowed file type: ${base}`,
      severity: "error",
    };
  }
  return null;
}

/**
 * Normalize + validate G1 file patches. Fail-closed on errors.
 */
export function validateFilePatches(
  input: Array<Partial<FilePatch> | null | undefined>,
): PatchValidationResult {
  const issues: PatchValidationIssue[] = [];
  const out: FilePatch[] = [];
  let totalBytes = 0;

  if (input.length > MAX_FILES) {
    issues.push({
      path: "*",
      code: "TOO_MANY_FILES",
      message: `Too many files (${input.length} > ${MAX_FILES})`,
      severity: "error",
    });
  }

  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_FILES + 5)) {
    if (!raw) continue;
    const path = normalizePath(String(raw.path ?? ""));
    const pathIssue = isPathSafe(path);
    if (pathIssue) {
      issues.push(pathIssue);
      continue;
    }
    if (seen.has(path)) continue;
    seen.add(path);

    const op = (raw.op ?? "write") as FilePatchOp;
    if (op !== "write" && op !== "create" && op !== "delete") {
      issues.push({
        path,
        code: "INVALID_OP",
        message: `Invalid op: ${String(raw.op)}`,
        severity: "error",
      });
      continue;
    }

    const content = op === "delete" ? "" : String(raw.content ?? "");
    if (op !== "delete" && content.length === 0) {
      issues.push({
        path,
        code: "EMPTY_CONTENT",
        message: "Empty content for write/create",
        severity: "warn",
      });
    }
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_FILE_BYTES) {
      issues.push({
        path,
        code: "TOO_LARGE",
        message: `File too large (${bytes} bytes)`,
        severity: "error",
      });
      continue;
    }
    // crude binary detect (char codes — avoid control-char regex lint)
    {
      const head = content.slice(0, 2000);
      let binaryLike = false;
      for (let i = 0; i < head.length; i++) {
        const c = head.charCodeAt(i);
        if (c <= 0x08 || (c >= 0x0e && c <= 0x1f)) {
          binaryLike = true;
          break;
        }
      }
      if (binaryLike) {
        issues.push({
          path,
          code: "BINARY_LIKE",
          message: "Binary-like content blocked",
          severity: "error",
        });
        continue;
      }
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      issues.push({
        path,
        code: "TOO_LARGE",
        message: "Total patch size exceeded",
        severity: "error",
      });
      break;
    }

    out.push({
      path,
      content,
      op,
      language: raw.language,
    });
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    ok: errors.length === 0 && out.length > 0,
    patches: out,
    issues,
    stats: {
      files: out.length,
      bytes: totalBytes,
      rejected: errors.length,
    },
  };
}

/** Build patches from primary file + optional multi-file map. */
export function patchesFromPipelineResult(input: {
  filePath: string;
  code: string;
  language?: string;
  affectedFiles?: string[];
  fileMap?: Map<string, { content: string; language?: string }> | Record<string, { content: string; language?: string }>;
}): PatchValidationResult {
  const list: Partial<FilePatch>[] = [
    {
      path: input.filePath,
      content: input.code,
      op: "write",
      language: input.language,
    },
  ];

  const map =
    input.fileMap instanceof Map
      ? input.fileMap
      : input.fileMap
        ? new Map(Object.entries(input.fileMap))
        : null;

  if (map) {
    for (const [path, v] of map) {
      if (path === input.filePath) continue;
      list.push({
        path,
        content: v.content,
        op: "write",
        language: v.language,
      });
    }
  } else if (input.affectedFiles) {
    for (const path of input.affectedFiles) {
      if (path === input.filePath) continue;
      // path listed without content — skip write, warn later in preflight
      list.push({ path, content: "", op: "write" });
    }
  }

  return validateFilePatches(list);
}
