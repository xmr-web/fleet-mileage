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
// Supabase can return the token in two ways depending on configuration:
//   1. Query string: ?token_hash=...&type=magiclink
//   2. Hash fragment: #access_token=...&type=magiclink
// We check both.

const params    = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.slice(1)); // strip leading #

const tokenHash  = params.get('token_hash');
const accessToken = hashParams.get('access_token');
const type       = params.get('type') || hashParams.get('type');

if (tokenHash && type === 'magiclink') {
  // Query string flow
  handleOtpCallback();
} else if (accessToken) {
  // Hash fragment flow — session is set automatically by Supabase, just redirect
  handleHashCallback();
}

async function handleOtpCallback() {
  setStatus('Signing you in…', '');
  sendBtn.disabled = true;

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });

  if (error) {
    setStatus('This link has expired or already been used. Please request a new one.', 'error');
    sendBtn.disabled = false;
  } else {
    window.location.replace('/admin/');
  }
}

async function handleHashCallback() {
  setStatus('Signing you in…', '');
  sendBtn.disabled = true;

  // Give Supabase a moment to process the hash and establish the session
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    window.location.replace('/admin/');
  } else {
    setStatus('This link has expired or already been used. Please request a new one.', 'error');
    sendBtn.disabled = false;
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
