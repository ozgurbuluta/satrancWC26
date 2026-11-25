/* PROPOSAL, not deployed anywhere. Script for the /satranc/ page (see index.html).

   Starts the frame and passes on a short allowlist from this page's address,
   so a shared link to one game or move still works. Nothing else is passed,
   and the page and the frame never exchange messages afterwards. */
(function () {
  var frame = document.getElementById('satranc');
  var open = document.getElementById('open');
  var target = new URL(frame.getAttribute('data-src'));
  var here = new URLSearchParams(location.search);

  // Only these, and only in these shapes.
  var allowed = {
    parti: /^\d{1,2}$/, // game number
    hamle: /^\d{1,3}$/, // half-move to show
    internal: /^[01]$/, // marks the owner's own visits in the chess site's statistics
    posthog: /^(test|off)$/, // marks a test tab
  };
  Object.keys(allowed).forEach(function (key) {
    var value = here.get(key);
    if (value && allowed[key].test(value)) target.searchParams.set(key, value);
  });

  // Where the visitor came from: the other site's host only, never its path or query.
  try {
    var from = document.referrer ? new URL(document.referrer) : null;
    if (from && from.hostname && from.hostname !== location.hostname) target.searchParams.set('ref', from.hostname);
  } catch (e) {
    /* no usable referrer */
  }

  open.href = target.href;
  // If the frame has not loaded after a while (blocked, offline), offer the direct link.
  var late = setTimeout(function () {
    open.classList.add('show');
  }, 8000);
  frame.addEventListener('load', function () {
    clearTimeout(late);
    open.classList.remove('show');
    // Arrow keys and other shortcuts work without a first click.
    try {
      frame.focus();
    } catch (e) {
      /* focus is a convenience */
    }
  });
  frame.src = target.href;
})();
