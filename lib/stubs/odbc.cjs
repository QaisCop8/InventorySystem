// Cloudflare Workers build only (next.config.mjs → CLOUDFLARE_BUILD): the native ODBC driver cannot run
// on Workers, so "odbc" resolves here. Loading it fails and callers report "ODBC driver is not available".
throw new Error("ODBC driver is not available in this environment")
