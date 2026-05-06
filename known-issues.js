import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.config.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const screens = {
  loading: document.getElementById('screen-loading'),
  error:   document.getElementById('screen-error'),
  issues:  document.getElementById('screen-issues'),
}

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'))
  screens[name].classList.add('active')
}

function showError(msg) {
  document.getElementById('error-msg').textContent = msg
  showScreen('error')
}

// ── Boot ──────────────────────────────────────────────────────
init()

async function init() {
  showScreen('loading')

  const params    = new URLSearchParams(window.location.search)
  const vehicleId = params.get('vehicle')

  if (!vehicleId) { showError('No vehicle ID in URL.'); return }

  const [vehicleRes, issuesRes] = await Promise.all([
    supabase.from('vehicles').select('id, name').eq('id', vehicleId).single(),
    supabase.from('faults')
      .select('id, description, driver_name, reported_at, fault_type')
      .eq('vehicle_id', vehicleId)
      .eq('is_known_issue', true)
      .neq('status', 'resolved')
      .order('reported_at', { ascending: false })
  ])

  if (vehicleRes.error || !vehicleRes.data) {
    showError(`Vehicle "${vehicleId}" not found.`)
    return
  }

  const vehicle = vehicleRes.data
  document.getElementById('vehicle-id-el').textContent   = vehicle.id
  document.getElementById('vehicle-name-el').textContent = vehicle.name

  const issues = issuesRes.data ?? []

  if (issues.length === 0) {
    document.getElementById('no-issues').style.display = 'flex'
  } else {
    const list = document.getElementById('issues-list')
    issues.forEach(issue => {
      const date = new Date(issue.reported_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      })
      const by = issue.driver_name ? `Reported by ${issue.driver_name}` : 'Reported by driver'

      const el = document.createElement('div')
      el.className = 'ki-item'
      el.innerHTML = `
        <div class="ki-item-icon">⚠</div>
        <div class="ki-item-body">
          <p class="ki-item-desc">${escapeHtml(issue.description)}</p>
          <p class="ki-item-meta">${by} · ${date}</p>
        </div>
      `
      list.appendChild(el)
    })
  }

  showScreen('issues')
}

// ── Back button ───────────────────────────────────────────────
document.getElementById('back-to-menu').addEventListener('click', () => {
  const params    = new URLSearchParams(window.location.search)
  const vehicleId = params.get('vehicle')
  window.location.href = `index.html?vehicle=${vehicleId}`
})

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
