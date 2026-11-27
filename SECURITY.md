# Security policy

## Supported versions

The latest published `0.0.x` release receives security fixes. Older releases may be asked to upgrade before a fix is provided.

## Reporting a vulnerability

Do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting:

https://github.com/Simon-He95/stream-diffs/security/advisories/new

Include:

- The affected version.
- A minimal reproduction or proof of concept.
- The impact you believe is possible.
- Any suggested fix or mitigation.

You can expect an initial response within a few business days. Valid reports will be fixed in a patch release and credited unless anonymity is requested.

## Scope

This package renders untrusted code and review content in the browser. Relevant areas include:

- HTML injection through annotations, custom headers, or theme names.
- Cross-site scripting in rendered token or diff output.
- Unsafe handling of Git patches, conflict markers, or malformed input.
- Supply-chain issues in the published package.
- Denial of service through pathological content sizes.

The library does not execute rendered code, does not fetch remote content on its own, and does not include an authentication or authorization layer. Host applications remain responsible for sanitizing data they pass to `renderAnnotation`, `renderCustomHeader`, `renderHeaderMetadata`, and similar DOM callbacks.
