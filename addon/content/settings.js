window.addEventListener('load', () => {
  const bridge = window.arguments[0];
  const get = id => document.getElementById(id);
  for (const key of ['browser', 'executable', 'profile', 'openMode']) get(key).value = bridge.settings[key];
  get('localFallback').checked = bridge.settings.localFallback;
  const fail = error => { get('error').textContent = error.message || String(error); };
  get('browse').addEventListener('click', async () => {
    try { const path = await bridge.pick(); if (path) get('executable').value = path; } catch (e) { fail(e); }
  });
  const save = async test => {
    get('error').textContent = '';
    try {
      await bridge.save({browser: get('browser').value, openMode: get('openMode').value, executable: get('executable').value.trim(),
        profile: get('profile').value.trim(), localFallback: get('localFallback').checked});
      if (test) bridge.test(); else window.close();
    } catch (e) { fail(e); }
  };
  get('save').addEventListener('click', () => save(false));
  get('test').addEventListener('click', () => save(true));
  get('cancel').addEventListener('click', () => window.close());
});
