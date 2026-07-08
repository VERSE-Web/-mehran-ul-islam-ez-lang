'use strict';
// Small helper invoked as a child process so that `get(url)` in Ez can behave
// synchronously (Ez has no async/await), while still using real fetch under the hood.

const url = process.argv[2];

(async () => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Ez-lang/0.1' } });
    const text = await res.text();
    process.stdout.write(JSON.stringify({ ok: res.ok, status: res.status, text }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, status: 0, text: '', error: String(err) }));
  }
})();
