# .daval File Specification

The `.daval` file is a proprietary encrypted JSON format used by the DaVal platform to deliver and execute automation solutions securely at the client-side.

## File Structure (Encrypted Payload)
```json
{
  "id": "REQ-1234",
  "client_id": "CLIENT_99",
  "version": "1.0.0",
  "author": "DaVal Expert Team",
  "payload": {
    "type": "workflow_script",
    "config": {
      "steps": [...],
      "triggers": [...]
    },
    "runtime": "daval-engine-v1"
  },
  "created_at": "2024-03-29T12:00:00Z",
  "integrity_hash": "sha256:..."
}
```

## Security Mechanism
1. **Passkey Encryption**: The file is encrypted using AES-256-CBC.
2. **Access Control**: Users must provide a 16-character passkey provided by DaVal to unlock and execute the file.
3. **Execution**: The platform's 'Solution Operator' interface decodes the file in-memory and mounts the automation interface.
