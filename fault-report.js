import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.config.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── State ─────────────────────────────────────────────────────
let vehicle = null
let vehicleId = null
let selectedType = null
let damagePoint = null   // { x, y } percentage on diagram
let photoFile = null

// ── Screens ───────────────────────────────────────────────────
const screens = {
  loading: document.getElementById('screen-loading'),
  error:   document.getElementById('screen-error'),
  type:    document.getElementById('screen-type'),
  detail:  document.getElementById('screen-detail'),
  success: document.getElementById('screen-success'),
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
  const params = new URLSearchParams(window.location.search)
  vehicleId = params.get('vehicle')

  if (!vehicleId) { showError('No vehicle ID in URL.'); return }

  const { data, error } = await supabase
    .from('vehicles').select('*').eq('id', vehicleId).single()

  if (error || !data) { showError(`Vehicle "${vehicleId}" not found.`); return }

  vehicle = data
  document.getElementById('vehicle-id-type').textContent   = vehicle.id
  document.getElementById('vehicle-name-type').textContent = vehicle.name
  showScreen('type')
}

// ── Navigation ────────────────────────────────────────────────
document.getElementById('back-to-menu').addEventListener('click', () => {
  window.location.href = `index.html?vehicle=${vehicleId}`
})

document.getElementById('back-to-type').addEventListener('click', () => {
  damagePoint = null
  showScreen('type')
})

document.getElementById('success-back-btn').addEventListener('click', () => {
  window.location.href = `index.html?vehicle=${vehicleId}`
})

// ── Fault type selection ──────────────────────────────────────
document.querySelectorAll('.fault-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedType = btn.dataset.type
    buildDetailScreen(selectedType)
    showScreen('detail')
  })
})

// ── Detail screen builder ─────────────────────────────────────
const detailTitles = {
  bulb:       'Light Bulb Out',
  adblue:     'AdBlue Low',
  tyre:       'Flat / Damaged Tyre',
  windscreen: 'Windscreen Chip',
  damage:     'New Dent / Damage',
  other:      'Other Issue',
}

function buildDetailScreen(type) {
  document.getElementById('detail-title').textContent = detailTitles[type]
  const container = document.getElementById('detail-content')
  container.innerHTML = ''
  damagePoint = null

  if (type === 'bulb') {
    container.innerHTML = `
      <div class="detail-question">
        <p class="detail-q-label">Which light is out?</p>
        <div class="pill-group" id="bulb-group">
          ${['Left headlight','Right headlight','Left rear','Right rear','Brake light','Interior','Number plate','Other'].map(b =>
            `<button class="pill" data-val="${b}">${b}</button>`
          ).join('')}
        </div>
      </div>`
    initPillGroup('bulb-group')

  } else if (type === 'adblue') {
    container.innerHTML = `
      <div class="detail-question">
        <p class="detail-q-label">Approximate range remaining</p>
        <div class="pill-group" id="range-group">
          ${['Under 100 miles','100–300 miles','300–500 miles','Not sure'].map(r =>
            `<button class="pill" data-val="${r}">${r}</button>`
          ).join('')}
        </div>
      </div>
      <div class="detail-question" style="margin-top:1.25rem">
        <p class="detail-q-label">How much AdBlue was added? <span class="optional-tag">optional</span></p>
        <div class="adblue-amount-row">
          <div class="input-wrap" style="flex:1">
            <input type="number" id="adblue-amount" inputmode="decimal" placeholder="0" min="0" step="0.5" class="text-input" style="text-align:right; padding-right: 60px;" />
            <span class="unit" style="right:14px">litres</span>
          </div>
        </div>
      </div>`
    initPillGroup('range-group')

  } else if (type === 'tyre') {
    container.innerHTML = `
      <div class="detail-question">
        <p class="detail-q-label">Which tyre?</p>
        <div class="pill-group" id="tyre-group">
          ${['Front left','Front right','Rear left','Rear right','Not sure'].map(t =>
            `<button class="pill" data-val="${t}">${t}</button>`
          ).join('')}
        </div>
      </div>`
    initPillGroup('tyre-group')

  } else if (type === 'windscreen') {
    container.innerHTML = `
      <div class="detail-question">
        <p class="detail-q-label">Tap the area of the windscreen where the chip is</p>
        <div class="diagram-wrap" id="windscreen-diagram">
          <svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" class="damage-diagram" id="ws-svg">
            <!-- Car body outline top-down -->
            <rect x="30" y="10" width="240" height="140" rx="18" fill="none" stroke="var(--border-strong)" stroke-width="2"/>
            <!-- Windscreen area -->
            <path d="M60 20 Q150 15 240 20 L230 80 Q150 75 70 80 Z" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
            <text x="150" y="52" text-anchor="middle" fill="var(--text-soft)" font-size="11" font-family="var(--font)">Windscreen</text>
            <!-- Driver / passenger labels -->
            <text x="80" y="100" text-anchor="middle" fill="var(--text-faint)" font-size="9" font-family="var(--font)">Driver</text>
            <text x="220" y="100" text-anchor="middle" fill="var(--text-faint)" font-size="9" font-family="var(--font)">Passenger</text>
            <!-- Pin placeholder -->
            <g id="ws-pin" style="display:none">
              <circle id="ws-pin-circle" cx="0" cy="0" r="10" fill="var(--danger)" opacity="0.25"/>
              <circle id="ws-pin-dot"    cx="0" cy="0" r="4"  fill="var(--danger)"/>
            </g>
          </svg>
          <p class="diagram-hint" id="ws-hint">Tap on the windscreen to mark the location</p>
        </div>
      </div>`
    initDiagram('ws-svg', 'ws-pin', 'ws-pin-circle', 'ws-pin-dot', 'ws-hint')

  } else if (type === 'damage') {
    container.innerHTML = `
      <div class="detail-question">
        <p class="detail-q-label">Tap the area of the vehicle where the damage is</p>
        <div class="diagram-tabs">
          <button class="diagram-tab active" data-view="top">Top view</button>
          <button class="diagram-tab" data-view="side">Side view</button>
        </div>
        <div class="diagram-wrap" id="damage-diagram">

          <!-- Top-down view -->
          <svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" class="damage-diagram" id="top-svg" data-view="top">
            <rect x="30" y="10" width="240" height="140" rx="18" fill="none" stroke="var(--border-strong)" stroke-width="2"/>
            <!-- Roof panel -->
            <rect x="70" y="25" width="160" height="110" rx="10" fill="var(--surface-2)" stroke="var(--border-strong)" stroke-width="1"/>
            <!-- Windscreen -->
            <path d="M75 35 Q150 30 225 35 L215 65 Q150 60 85 65 Z" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
            <!-- Rear window -->
            <path d="M85 95 Q150 100 215 95 L225 125 Q150 130 75 125 Z" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
            <!-- Labels -->
            <text x="150" y="20" text-anchor="middle" fill="var(--text-faint)" font-size="9" font-family="var(--font)">FRONT</text>
            <text x="150" y="155" text-anchor="middle" fill="var(--text-faint)" font-size="9" font-family="var(--font)">REAR</text>
            <text x="20" y="83" text-anchor="middle" fill="var(--text-faint)" font-size="8" font-family="var(--font)" transform="rotate(-90,20,83)">DRIVER</text>
            <text x="282" y="83" text-anchor="middle" fill="var(--text-faint)" font-size="8" font-family="var(--font)" transform="rotate(90,282,83)">PASS.</text>
            <g id="top-pin" style="display:none">
              <circle id="top-pin-circle" cx="0" cy="0" r="10" fill="var(--danger)" opacity="0.25"/>
              <circle id="top-pin-dot"    cx="0" cy="0" r="4"  fill="var(--danger)"/>
            </g>
          </svg>

          <!-- Side view -->
          <svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" class="damage-diagram" id="side-svg" data-view="side" style="display:none">
            <!-- Car body -->
            <path d="M20 110 Q20 90 40 90 L60 50 Q90 30 150 28 Q200 28 230 45 L260 90 Q278 90 280 110 Z"
              fill="var(--surface-2)" stroke="var(--border-strong)" stroke-width="2"/>
            <!-- Windows -->
            <path d="M65 88 L75 55 Q95 38 150 36 Q195 36 220 50 L240 88 Z"
              fill="none" stroke="var(--accent)" stroke-width="1.5"/>
            <!-- Wheels -->
            <circle cx="75"  cy="116" r="22" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="2"/>
            <circle cx="75"  cy="116" r="10" fill="var(--surface-2)" stroke="var(--border-strong)" stroke-width="1.5"/>
            <circle cx="225" cy="116" r="22" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="2"/>
            <circle cx="225" cy="116" r="10" fill="var(--surface-2)" stroke="var(--border-strong)" stroke-width="1.5"/>
            <!-- Labels -->
            <text x="25"  y="145" fill="var(--text-faint)" font-size="9" font-family="var(--font)">FRONT</text>
            <text x="250" y="145" fill="var(--text-faint)" font-size="9" font-family="var(--font)">REAR</text>
            <g id="side-pin" style="display:none">
              <circle id="side-pin-circle" cx="0" cy="0" r="10" fill="var(--danger)" opacity="0.25"/>
              <circle id="side-pin-dot"    cx="0" cy="0" r="4"  fill="var(--danger)"/>
            </g>
          </svg>

          <p class="diagram-hint" id="damage-hint">Tap on the vehicle to mark the damage location</p>
        </div>
      </div>`

    // Tab switching
    document.querySelectorAll('.diagram-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.diagram-tab').forEach(t => t.classList.remove('active'))
        tab.classList.add('active')
        const view = tab.dataset.view
        document.getElementById('top-svg').style.display  = view === 'top'  ? 'block' : 'none'
        document.getElementById('side-svg').style.display = view === 'side' ? 'block' : 'none'
        damagePoint = null
        document.getElementById('top-pin').style.display  = 'none'
        document.getElementById('side-pin').style.display = 'none'
        document.getElementById('damage-hint').style.display = 'block'
      })
    })

    initDiagram('top-svg',  'top-pin',  'top-pin-circle',  'top-pin-dot',  'damage-hint')
    initDiagram('side-svg', 'side-pin', 'side-pin-circle', 'side-pin-dot', 'damage-hint')

  } else if (type === 'other') {
    container.innerHTML = `
      <div class="detail-question">
        <p class="detail-q-label">Please describe the issue</p>
        <textarea id="other-description" class="text-area" rows="4" placeholder="Describe the fault as clearly as you can…"></textarea>
      </div>`
  }
}

// ── Pill group helper ─────────────────────────────────────────
function initPillGroup(groupId) {
  document.getElementById(groupId).addEventListener('click', e => {
    const btn = e.target.closest('.pill')
    if (!btn) return
    document.querySelectorAll(`#${groupId} .pill`).forEach(p => p.classList.remove('selected'))
    btn.classList.add('selected')
  })
}

// ── Diagram tap helper ────────────────────────────────────────
function initDiagram(svgId, pinGroupId, circleId, dotId, hintId) {
  const svg       = document.getElementById(svgId)
  const pinGroup  = document.getElementById(pinGroupId)
  const pinCircle = document.getElementById(circleId)
  const pinDot    = document.getElementById(dotId)
  const hint      = document.getElementById(hintId)

  svg.addEventListener('click', e => {
    const rect = svg.getBoundingClientRect()
    const vb   = svg.viewBox.baseVal

    // Convert click to SVG coordinate space
    const scaleX = vb.width  / rect.width
    const scaleY = vb.height / rect.height
    const svgX   = (e.clientX - rect.left)  * scaleX
    const svgY   = (e.clientY - rect.top)   * scaleY

    pinCircle.setAttribute('cx', svgX)
    pinCircle.setAttribute('cy', svgY)
    pinDot.setAttribute('cx', svgX)
    pinDot.setAttribute('cy', svgY)
    pinGroup.style.display = 'block'

    // Store as percentage + which view
    damagePoint = {
      x:    Math.round((svgX / vb.width)  * 100),
      y:    Math.round((svgY / vb.height) * 100),
      view: svg.dataset.view ?? 'windscreen'
    }

    if (hint) hint.style.display = 'none'
  })
}

// ── Photo upload ──────────────────────────────────────────────
const photoInput      = document.getElementById('photo-input')
const photoLabel      = document.getElementById('photo-upload-label')
const photoPreviewWrap= document.getElementById('photo-preview-wrap')
const photoPreview    = document.getElementById('photo-preview')
const photoRemoveBtn  = document.getElementById('photo-remove-btn')

photoLabel.addEventListener('click', () => photoInput.click())

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0]
  if (!file) return
  photoFile = file
  const url = URL.createObjectURL(file)
  photoPreview.src = url
  photoPreviewWrap.style.display = 'block'
  document.getElementById('photo-upload-text').textContent = file.name
})

photoRemoveBtn.addEventListener('click', () => {
  photoFile = null
  photoInput.value = ''
  photoPreviewWrap.style.display = 'none'
  document.getElementById('photo-upload-text').textContent = 'Tap to add a photo'
})

// ── Submit ────────────────────────────────────────────────────
document.getElementById('submit-fault-btn').addEventListener('click', submitFault)

async function submitFault() {
  const btn   = document.getElementById('submit-fault-btn')
  const label = document.getElementById('submit-label')

  // Build description from selected inputs
  let description = ''
  let extraData   = {}

  if (selectedType === 'bulb') {
    const sel = document.querySelector('#bulb-group .pill.selected')
    if (!sel) { showDetailError('Please select which light is out.'); return }
    description = `Light bulb out: ${sel.dataset.val}`

  } else if (selectedType === 'adblue') {
    const sel    = document.querySelector('#range-group .pill.selected')
    if (!sel) { showDetailError('Please select the approximate range remaining.'); return }
    const amount = document.getElementById('adblue-amount')?.value
    description  = `AdBlue low. Range remaining: ${sel.dataset.val}`
    if (amount) description += `. Added: ${amount} litres`

  } else if (selectedType === 'tyre') {
    const sel = document.querySelector('#tyre-group .pill.selected')
    if (!sel) { showDetailError('Please select which tyre.'); return }
    description = `Flat/damaged tyre: ${sel.dataset.val}`

  } else if (selectedType === 'windscreen') {
    description = 'Windscreen chip'
    if (damagePoint) description += ` — location marked on diagram`

  } else if (selectedType === 'damage') {
    description = 'New dent/body damage'
    if (damagePoint) description += ` — location marked on diagram (${damagePoint.view} view)`

  } else if (selectedType === 'other') {
    const text = document.getElementById('other-description')?.value?.trim()
    if (!text) { showDetailError('Please describe the issue.'); return }
    description = text
  }

  const driverName = document.getElementById('driver-name').value.trim() || null

  btn.disabled = true
  label.textContent = 'Submitting…'

  // Upload photo if present
  let photoUrl = null
  if (photoFile) {
    const ext      = photoFile.name.split('.').pop()
    const filePath = `${vehicleId}/${Date.now()}.${ext}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('fault-photos')
      .upload(filePath, photoFile, { contentType: photoFile.type })

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('fault-photos').getPublicUrl(filePath)
      photoUrl = urlData?.publicUrl ?? null
    }
  }

  // Insert fault record
  const { error } = await supabase.from('faults').insert([{
    vehicle_id:      vehicleId,
    fault_type:      selectedType,
    description:     description,
    driver_name:     driverName,
    photo_url:       photoUrl,
    damage_location: damagePoint ?? null,
    severity:        'normal',
    status:          'open',
  }])

  if (error) {
    btn.disabled = false
    label.textContent = 'Submit Report'
    showDetailError('Failed to submit. Please try again.')
    console.error(error)
    return
  }

  document.getElementById('success-detail').textContent = detailTitles[selectedType]
  showScreen('success')
}

function showDetailError(msg) {
  // Reuse or create an error message below the submit button
  let el = document.getElementById('fault-submit-error')
  if (!el) {
    el = document.createElement('p')
    el.id = 'fault-submit-error'
    el.className = 'validation-msg'
    document.getElementById('submit-fault-btn').insertAdjacentElement('afterend', el)
  }
  el.textContent = msg
}
