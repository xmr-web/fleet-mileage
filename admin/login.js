/**
 * login.js — Fleet Admin login page
 *
 * Handles two situations:
 *   1. User lands on login page to request a magic link
 *   2. User clicks the magic link in their email and is redirected back
 *      — Supabase appends a token to the URL which this script exchanges
 *        for a session, then redirects to the dashboard
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusEl = document.getElementById('login-status');
const sendBtn  = document.getElementById('send-btn');
const emailEl  = document.getElementById('email');

// ── Handle magic link callback ─────────────────────────────────────────────
// When the user clicks the link in their email, Supabase redirects them back
// to the site with a token_hash in the URL. We detect that and exchange it
// for a real session, then send them to the dashboard.
const params = new URLSearchParams(window.location.search);
const tokenHash = params.get('token_hash');
const type      = params.get('type');

if (tokenHash && type === 'magiclink') {
  setStatus('Signing you in…', '');
  sendBtn.disabled = true;

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });

  if (error) {
    setStatus('This link has expired or already been used. Please request a new one.', 'error');
    sendBtn.disabled = false;
  } else {
    // Session established — go to the dashboard
    window.location.replace('/admin/');
  }
}

// ── Send magic link ────────────────────────────────────────────────────────
sendBtn.addEventListener('click', async () => {
  const email = emailEl.value.trim();

  if (!email) {
    setStatus('Please enter your email address.', 'error');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  setStatus('', '');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // After clicking the link, Supabase redirects here.
      // The login.js callback above then picks up the token.
      emailRedirectTo: `${window.location.origin}/admin/login.html`,
    },
  });

  if (error) {
    setStatus(`Could not send link: ${error.message}`, 'error');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send sign-in link';
  } else {
    setStatus('Link sent! Check your email and click the link to sign in.', 'success');
    sendBtn.textContent = 'Send sign-in link';
    // Leave button disabled — prevents hammering the send endpoint
  }
});

// Allow pressing Enter in the email field
emailEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn.click();
});

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `login-status${type ? ' ' + type : ''}`;
}
