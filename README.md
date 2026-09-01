# Town of Glasgow website

This project is the foundation for a public-facing town website that presents official information clearly, accessibly, and in a format that can be managed with lightweight automated updates.

## What is included
- Desktop and mobile-friendly layout
- Accessible navigation and focus states
- Government, services, documents, events, and contact sections
- Integration-ready structure for Google Calendar, document archives, and public notices

## Recommended go-live items
1. Confirm all public-facing copy and official office/contact details with the town.
2. Replace any remaining sample or proof-of-concept content with approved final wording.
3. Add the final Google Calendar ID, event labels, and approved schedule configuration.
4. Confirm document storage permissions, archive organization, and public access rules.
5. Add final branding, logo files, hero imagery, and accessibility review notes.
6. Validate the dashboard and admin flows with a non-public test account and secure credentials.
7. Complete final accessibility, browser, and mobile QA before launch.
8. Configure analytics, SEO metadata, and a maintenance contact or support process.

## Google Cloud deployment model
This project is served as a static front-end with live Google Cloud Run / Cloud Function endpoints for admin and operational actions. Public pages read data directly from the site’s public APIs or GCS-backed JSON files; protected admin tasks are validated server-side using signed session tokens.

### Required Google Cloud setup
- Create or select a Google Cloud project and enable billing.
- Enable the Google Calendar API, Cloud Storage API, and required IAM / admin APIs.
- Create a service account for server-to-server access and store the JSON private key securely in Cloud Secret Manager or an equivalent secure secret store.
- Grant the service account access to the target Google Cloud Storage bucket and calendar resources.
- Configure environment variables for each deployed function, including the shared `SESSION_SECRET` or `ADMIN_SESSION_SECRET`, plus any required GCS / calendar / SMS settings.

### Production auth contract
- `adminlogin` is the only session-issuing endpoint.
- Admin functions require an `Authorization: Bearer <token>` header.
- The server validates the signed session token against the secret configured on the function.
- Protected functions reject missing, expired, or invalid tokens with `401 Unauthorized`.
- Public read-only pages do not require admin authentication.
- Browser state, DOM visibility, or CSS class state is never trusted as proof of authentication.
- No raw shared secret is accepted directly from the browser for admin actions.

### Current deployed function set
- `adminlogin` — issues signed admin session tokens.
- `adminusers` — manages dashboard users and protected admin records.
- `publicnotices` — public GET access; admin save/update requires validated session auth.
- `calendarwrite` — creates and updates Google Calendar events; requires validated session auth.
- `servicerequests` — public create/lookup; protected admin status updates require validated session auth.
- `uploaddocuments` — document upload endpoint; requires validated session auth.
- `uploadimage` — Government/community image upload endpoint; requires validated session auth.
- `councilimages` — public data/image listing; non-GET operations require validated session auth.
- `readevents` / related read endpoints — public event data endpoints.
- `readdocuments` — public document and agenda read endpoint backed by GCS; keeps client-side pages from needing direct Google API key usage.
- `twiliosms` — SMS endpoint; requires server-side secret configuration and validated access controls.

### Environment variables
- `SESSION_SECRET` or `ADMIN_SESSION_SECRET` — shared secret used to sign and verify admin session tokens.
- `ADMIN_SESSION_TTL_MS` or `SESSION_TTL_MS` — admin session lifetime in milliseconds. Set this on the Cloud Function runtime configuration and redeploy after changes.
- `USER_PASSWORD_PEPPER` or `LOGIN_PASSWORD_PEPPER` — used when hashing stored password values.
- `GCS_SERVICE_ACCOUNT_JSON` — Google service account credentials for storage and calendar operations.
- `GCS_BUCKET` / `BUCKET_NAME` — target storage bucket.
- `GOOGLE_CALENDAR_ID` — calendar used for event creation.
- `GOOGLE_CALENDAR_TIMEZONE` — optional timezone override.
- `DOCUMENTS_PREFIX` — optional documents listing prefix used by `readdocuments`.
- `AGENDA_PREFIX` — optional agenda lookup prefix used by `readdocuments`.
- `TWILIO_*` values — only for SMS functionality.

### Production hardening
- Store all secrets in Google Cloud Secret Manager or equivalent.
- Keep the same secret consistent across all deployed admin functions.
- Configure CORS only where needed for browser access.
- Add logging, error reporting, and health checks for all deployed functions.
- Ensure the live front-end points only to the deployed Cloud Run endpoints.
- Validate all protected flows from production-like URLs before final launch.

## Local preview
Open `index.html` directly in a browser, or run a local static server from this folder for local testing.

## Local development notes
- For the Cloud Function deployment, configure runtime environment variables on the function itself rather than committing a repo-based `.env` file.
- For local Node testing, set the needed variables in the shell environment before running the function, but do not rely on a checked-in `.env` file for deployed runtime config.
- Production must always use secure secret storage and runtime environment configuration.
