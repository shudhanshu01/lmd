# Cloud Registry Deployment

The project now includes `server.js`, a provider-neutral registry API and static web server. It uses a durable JSON file for the prototype. For production, replace the JSON repository with PostgreSQL or the state service supplied by the state/central platform.

## Local run

```powershell
node server.js
```

Open the portal through the server, not by double-clicking an HTML file:

- Portal: `http://localhost:3000`
- GATC dashboard: `http://localhost:3000/gatc/dashboard.html`
- Certificate verification: `http://localhost:3000/verify-certificate.html`
- Health check: `http://localhost:3000/api/health`

The browser writes shared records to `POST /api/v1/sync`. Public QR verification reads `GET /api/v1/certificates/{certificateId}` and calculates validity from the server clock and certificate expiry.

## Production deployment

1. Deploy `server.js` to a Node-capable HTTPS host or container.
2. Mount persistent storage for `data/cloud-state.json`, or replace the repository functions with a managed database.
3. Set `PORT` and configure the public origin in `GATC_PUBLIC_URL`.
4. Serve the portal from the same HTTPS origin, or set `window.GATC_API_BASE` to the HTTPS API origin before `storage.js` loads.
5. Put the API behind TLS, authentication, rate limiting, structured audit storage, and a managed secret store.
6. Restrict CORS from `*` to the actual portal and public verification origins.
7. Replace the demo QR image endpoint with an approved QR generation service or server-side QR library.
8. Configure backups, WORM/immutable audit retention, database encryption, monitoring, and eMaap credentials according to the state/central integration agreement.

## Live verification behavior

A QR code contains the public certificate URL. The verifier never trusts the QR payload as proof by itself; it calls the registry and displays:

- `VALID` when the certificate is certified and the server expiry has not passed
- `EXPIRED` when the server clock is past `validUntil`
- `REJECTED` when the certificate outcome is rejected
- `NOT_FOUND` when no official registry record exists

The browser countdown is only a presentation aid. The server response is authoritative and includes `serverTime`, `expiresInSeconds`, `liveStatus`, and `isValid`.
