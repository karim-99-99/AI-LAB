# Encrypted Research Archive

**Classification:** PRIVATE / CONFIDENTIAL

Reports produced by Addendum A automation are stored here as **AES-256-CBC** (OpenSSL, PBKDF2) `.enc` files.

```text
archive/
├── inbox/                 # short-lived plaintext copies for operator review
├── <task_id>/
│   └── YYYY-MM-DD/
│       └── <timestamp>-report.md.enc
└── README.md
```

## Rules

- Passphrase lives in **macOS Keychain** (`ailab.research-archive` / `passphrase`) — never in git.
- Do not commit `.enc` contents that contain real research if your org policy forbids it; default `.gitignore` ignores generated archives.
- **Local-Only** workspace outputs follow the same archive path; they must never be emailed or synced externally by automation.
- Decrypt (macOS, after Keychain is set):

```bash
security find-generic-password -s ailab.research-archive -a passphrase -w | \
  openssl enc -d -aes-256-cbc -pbkdf2 -in path/to/file.md.enc -out /tmp/out.md -pass stdin
```
