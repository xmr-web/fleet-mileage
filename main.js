import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.config.js'

// ── Supabase ─────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── DOM refs ─────────────────────────────────────────────────
const screens = {
  loading: document.getElementById('screen-loading'),
  error:   document.getElementById('screen-error'),
  choice:  document.getElementById('screen-choice'),
  app:     document.getElementById('screen-app'),
  success: document.getElementById('screen-success'),
}

// Choice screen
const vehiclePhoto     = document.getElementById('vehicle-photo')
const vehicleIdEl      = document.getElementById('vehicle-id-display')
const vehicleNameEl    = document.getElementById('vehicle-name-display')
const issuesCount      = document.getElementById('issues-count')

// Mileage screen
const vehiclePhoto2    = document.getElementById('vehicle-photo-2')
const vehicleIdEl2     = document.getElementById('vehicle-id-display-2')
const vehicleNameEl2   = document.getElementById('vehicle-name-display-2')
const prevMileageEl    = document.getElementById('prev-mileage')
const mileageInput     = document.getElementById('mileage-input')
const confirmBtn       = document.getElementById('confirm-btn')
const btnLabel         = document.getElementById('btn-label')
const validationMsg    = document.getElementById('validation-msg')
const errorMsg         = document.getElementById('error-msg')
const successMsg       = document.getElementById('success-msg')
const successDetail    = document.getElementById('success-detail')

// ── State ─────────────────────────────────────────────────────
let vehicle = null
let vehicleId = null

// ── Boot ──────────────────────────────────────────────────────
init()

async function init() {
  showScreen('loading')

  const params = new URLSearchParams(window.location.search)
  vehicleId = params.get('vehicle')

  if (!vehicleId) {
    showError('No vehicle ID found in this QR code URL.')
    return
  }

  // Load vehicle + known issues count in parallel
  const [vehicleRes, issuesRes] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', vehicleId).single(),
    supabase.from('known_issues').select('id', { count: 'exact', head: true })
      .eq('vehicle_id', vehicleId).eq('resolved', false)
  ])

  if (vehicleRes.error || !vehicleRes.data) {
    showError(`Vehicle ID "${vehicleId}" was not found in the system.`)
    return
  }

  vehicle = vehicleRes.data
  populateChoice()

  // Show known issues badge if any
  const count = issuesRes.count ?? 0
  if (count > 0) {
    issuesCount.textContent = count
    issuesCount.style.display = 'flex'
  }

  showScreen('choice')
}

// ── Populate choice screen ────────────────────────────────────
function populateChoice() {
  vehicleIdEl.textContent   = vehicle.id
  vehicleNameEl.textContent = vehicle.name

  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/vehicle-images`
  const photoUrl = vehicle.image_url
    ? `${STORAGE_BASE}/${encodeURIComponent(vehicle.image_url)}`
    : null

  if (photoUrl) {
    vehiclePhoto.src = photoUrl
    vehiclePhoto.alt = vehicle.name
  } else {
    vehiclePhoto.style.display = 'none'
  }

  // Also populate mileage screen header
  vehicleIdEl2.textContent   = vehicle.id
  vehicleNameEl2.textContent = vehicle.name
  if (photoUrl) {
    vehiclePhoto2.src = photoUrl
    vehiclePhoto2.alt = vehicle.name
  } else {
    vehiclePhoto2.style.display = 'none'
  }

  const prev = vehicle.current_mileage ?? 0
  prevMileageEl.textContent = prev.toLocaleString('en-GB') + ' mi'
}

// ── Choice button handlers ────────────────────────────────────
document.getElementById('btn-mileage').addEventListener('click', () => {
  showScreen('app')
  setTimeout(() => mileageInput.focus(), 300)
})

document.getElementById('btn-fault').addEventListener('click', () => {
  window.location.href = `fault-report.html?vehicle=${vehicleId}`
})

document.getElementById('btn-issues').addEventListener('click', () => {
  window.location.href = `known-issues.html?vehicle=${vehicleId}`
})

document.getElementById('back-btn-mileage').addEventListener('click', () => {
  showScreen('choice')
})

document.getElementById('success-back-btn').addEventListener('click', () => {
  // Reset mileage input and go back to choice
  mileageInput.value = ''
  clearValidation()
  confirmBtn.disabled = false
  confirmBtn.classList.remove('loading')
  btnLabel.textContent = 'Confirm Mileage'
  showScreen('choice')
})

// ── Validation ────────────────────────────────────────────────
mileageInput.addEventListener('input', () => {
  const val = parseInt(mileageInput.value, 10)
  const prev = vehicle?.current_mileage ?? 0

  if (mileageInput.value === '') { clearValidation(); return }
  if (isNaN(val) || val < 0) { setError('Please enter a valid mileage.'); return }
  if (val < prev) {
    setError(`Mileage cannot be less than the previous reading (${prev.toLocaleString('en-GB')} mi).`)
    return
  }
  clearValidation()
})

function setError(msg) {
  validationMsg.textContent = msg
  mileageInput.classList.add('error')
}

function clearValidation() {
  validationMsg.textContent = ''
  mileageInput.classList.remove('error')
}

// ── Submit mileage ────────────────────────────────────────────
confirmBtn.addEventListener('click', submitMileage)

async function submitMileage() {
  const val = parseInt(mileageInput.value, 10)
  const prev = vehicle?.current_mileage ?? 0

  if (!mileageInput.value || isNaN(val)) {
    setError('Please enter a mileage reading.')
    mileageInput.focus()
    return
  }
  if (val < prev) {
    setError(`Mileage cannot be less than the previous reading (${prev.toLocaleString('en-GB')} mi).`)
    return
  }

  confirmBtn.disabled = true
  confirmBtn.classList.add('loading')
  btnLabel.textContent = 'Saving…'

  const { error: logError } = await supabase
    .from('mileage_log')
    .insert([{ vehicle_id: vehicle.id, mileage: val }])

  if (logError) {
    confirmBtn.disabled = false
    confirmBtn.classList.remove('loading')
    btnLabel.textContent = 'Confirm Mileage'
    setError('Failed to save. Please try again.')
    console.error(logError)
    return
  }

  await supabase
    .from('vehicles')
    .update({ current_mileage: val })
    .eq('id', vehicle.id)

  successMsg.textContent = `${vehicle.name} — ${vehicle.id}`
  successDetail.textContent = val.toLocaleString('en-GB') + ' mi recorded'
  showScreen('success')
}

// ── Screen helper ─────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'))
  screens[name].classList.add('active')
}

function showError(msg) {
  errorMsg.textContent = msg
  showScreen('error')
}
