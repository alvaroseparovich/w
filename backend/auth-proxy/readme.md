# PENDING TO IMPLEMENT
- it needs to revalidate the token.

Notes
- When deployed behind a Lambda Function URL, do not enable the Express CORS middleware; the Function URL injects CORS headers. We gate CORS in server.js to only apply when running locally.