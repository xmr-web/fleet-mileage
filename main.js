import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.config.js'

// ── Supabase ─────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── DOM refs ─────────────────────────────────────────────────
const screens = {
  loading: document.getElementById('screen-loading'),
  error:   document.getElementById('screen-error'),
  app:     document.getElementById('screen-app'),
  success: document.getElementById('screen-success'),
}

const vehiclePhoto    = document.getElementById('vehicle-photo')
const vehicleIdEl     = document.getElementById('vehicle-id-display')
const vehicleNameEl   = document.getElementById('vehicle-name-display')
const prevMileageEl   = document.getElementById('prev-mileage')
const mileageInput    = document.getElementById('mileage-input')
const confirmBtn      = document.getElementById('confirm-btn')
const btnLabel        = document.getElementById('btn-label')
const validationMsg   = document.getElementById('validation-msg')
const errorMsg        = document.getElementById('error-msg')
const successMsg      = document.getElementById('success-msg')
const successDetail   = document.getElementById('success-detail')

// ── State ─────────────────────────────────────────────────────
let vehicle = null

// ── Boot ──────────────────────────────────────────────────────
init()

async function init() {
  showScreen('loading')

  const params = new URLSearchParams(window.location.search)
  const vehicleId = params.get('vehicle')

  if (!vehicleId) {
    showError('No vehicle ID found in this QR code URL.')
    return
  }

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single()

  if (error || !data) {
    showError(`Vehicle ID "${vehicleId}" was not found in the system.`)
    return
  }

  vehicle = data
  populateApp()
  showScreen('app')

  // Auto-focus the input to bring up the number pad immediately
  setTimeout(() => mileageInput.focus(), 300)
}

// ── Populate app screen ───────────────────────────────────────
function populateApp() {
  vehicleIdEl.textContent   = vehicle.id
  vehicleNameEl.textContent = vehicle.name

  if (vehicle.image_url) {
    vehiclePhoto.src = vehicle.image_url
    vehiclePhoto.alt = vehicle.name
  } else {
    vehiclePhoto.style.background = '#22262e'
    vehiclePhoto.style.display = 'none'
  }

  const prev = vehicle.current_mileage ?? 0
  prevMileageEl.textContent = prev.toLocaleString('en-GB') + ' mi'
}

// ── Validation ────────────────────────────────────────────────
mileageInput.addEventListener('input', () => {
  const val = parseInt(mileageInput.value, 10)
  const prev = vehicle?.current_mileage ?? 0

  if (mileageInput.value === '') {
    clearValidation()
    return
  }

  if (isNaN(val) || val < 0) {
    setError('Please enter a valid mileage.')
    return
  }

  if (val < prev) {
    setError(`Mileage cannot be less than the previous reading (${prev.toLocaleString('en-GB')} mi).`)
    return
  }

  clearValidation()
})

function setError(msg) {
  validationMsg.textContent = msg
  mileageInput.classList.add('error')
  mileageInput.classList.remove('ok')
}

function clearValidation() {
  validationMsg.textContent = ''
  mileageInput.classList.remove('error')
}

// ── Submit ────────────────────────────────────────────────────
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

  // Disable button while submitting
  confirmBtn.disabled = true
  confirmBtn.classList.add('loading')
  btnLabel.textContent = 'Saving…'

  // Insert into mileage_log
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

  // Update current_mileage on vehicle
  await supabase
    .from('vehicles')
    .update({ current_mileage: val })
    .eq('id', vehicle.id)

  // Show success
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
