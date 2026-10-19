// Presentation only: Medusa owns the form, validation, session and reset links.
const STYLE_ID = "oweg-auth-redesign"
const PANEL_ID = "oweg-auth-brand-panel"
const WRAPPER_ID = "oweg-auth-card-wrapper"
const LOGO_ID = "oweg-auth-logo"
let logoSrc: string | null = null
let initialized = false
let timer: number | null = null
let observer: MutationObserver | null = null

const icons = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  sales: '<path d="M4 20V13h4v7m2 0V8h4v12m2 0V3h4v17"/>',
  card: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
  truck: '<path d="M1 3h14v14H1zM15 8h4l3 4v5h-7"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
}
function icon(paths: string) {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}
function brand(src: string, className: string) {
  const block = document.createElement("div")
  block.className = className
  const image = document.createElement("img")
  image.src = src
  image.alt = "OWEG"
  const caption = document.createElement("p")
  caption.textContent = "ADMIN CONTROL"
  block.append(image,caption)
  return block
}
function styles() {
  return `
  .oweg-auth-page { position:relative; isolation:isolate; overflow:hidden; width:100%; min-height:100dvh; background:#fcfdfb!important; color:#101827; color-scheme:light; font-family:Inter,system-ui,sans-serif; }
  .oweg-auth-page::before,.oweg-auth-page::after { content:""; position:absolute; z-index:-1; pointer-events:none; border-radius:50%; }
  .oweg-auth-page::before { width:440px; height:440px; top:-340px; left:40%; border:48px solid #89c74610; }
  .oweg-auth-page::after { width:300px; height:300px; right:-200px; bottom:-210px; border:42px solid #8ac94b55; }
  #${WRAPPER_ID} { display:flex; align-items:center; justify-content:center; width:100%; min-height:100dvh; padding:32px 24px; position:relative; }
  #${PANEL_ID} { display:none; }
  .oweg-auth-card { box-sizing:border-box; width:100%!important; max-width:440px!important; margin:0!important; padding:38px 32px 26px; border:1px solid #dcebcf; border-radius:18px; background:#ffffffed; box-shadow:0 18px 60px #4269230b,0 4px 18px #5b962315; color:#101827; }
  .oweg-auth-page .oweg-default-logo { display:none!important; }
  #${LOGO_ID} { width:100%; display:flex; align-items:center; flex-direction:column; margin:0 0 30px; }
  #${LOGO_ID} img { width:196px; height:auto; object-fit:contain; }
  #${LOGO_ID} p { margin:9px 0 0; padding-left:5px; letter-spacing:5px; font-size:12px; color:#41464c; }
  .oweg-auth-card h1 { font-size:25px!important; font-weight:750!important; line-height:1.25; letter-spacing:-.8px; color:#111827!important; text-align:center; }
  .oweg-auth-card h1 + p { max-width:310px; margin-top:8px; color:#777e8d!important; font-size:13px; line-height:1.6; }
  .oweg-auth-card > div.mb-4,.oweg-auth-card > div.mb-6 { margin-bottom:26px; }
  .oweg-auth-card form { gap:20px; }
  .oweg-auth-card form > div:first-child { gap:14px; }
  .oweg-auth-card input { height:46px!important; border:1px solid #e2e5e9!important; border-radius:8px!important; background:#fff!important; color:#17202d!important; box-shadow:0 1px 2px #192c1704!important; padding-left:14px; font-size:13px; }
  .oweg-auth-card input::placeholder { color:#8b919d!important; }
  .oweg-auth-card input:focus { outline:2px solid #7aba3b55!important; outline-offset:2px; border-color:#79b936!important; }
  .oweg-auth-card input[aria-invalid="true"] { border-color:#dc2626!important; }
  .oweg-auth-card button[type="submit"] { height:46px!important; border:0!important; border-radius:8px!important; background:linear-gradient(100deg,#78b915,#5e9f0c)!important; box-shadow:0 6px 16px #75b53130!important; color:#fff!important; font-size:14px; font-weight:600; transition:filter .18s; }
  .oweg-auth-card button[type="submit"]:hover:not(:disabled) { filter:brightness(.96); }
  .oweg-auth-card button[type="submit"]:focus-visible,.oweg-auth-card a:focus-visible { outline:2px solid #539414; outline-offset:4px; }
  .oweg-auth-card button[type="submit"]:disabled { opacity:.65; }
  .oweg-auth-card > span { color:#727b87!important; margin:20px 0 0!important; font-size:12px; text-align:center; }
  .oweg-auth-card a { color:#5e9b25!important; text-underline-offset:3px; }
  .oweg-auth-card .oweg-auth-security { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; margin:24px 0 0; padding-top:18px; border-top:1px solid #ecf0e8; font-size:11px; color:#747c86; }
  .oweg-auth-security svg { color:#73b72b; width:17px; height:17px; flex-shrink:0; }
  .oweg-brand-logo img { width:min(100%,360px); height:auto; }
  .oweg-brand-logo p { margin:13px 0 0; color:#303a39; font-size:18px; letter-spacing:8px; }
  .oweg-brand-panel h2 { margin:36px 0 12px; font-size:clamp(30px,3.3vw,48px); font-weight:760; letter-spacing:-1.9px; line-height:1.15; color:#111827; }
  .oweg-brand-copy { max-width:490px; margin:0; color:#7a8190; font-size:16px; line-height:1.65; }
  .oweg-brand-panel h2 span { color:#72b431; }
  .oweg-brand-features { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:28px; }
  .oweg-brand-feature { min-height:128px; border:1px solid #e4eddb; border-radius:10px; background:#ffffffa6; padding:16px 8px; display:flex; align-items:center; flex-direction:column; gap:12px; text-align:center; color:#283140; font-size:12px; line-height:1.45; }
  .oweg-brand-feature > span { width:44px; height:44px; display:grid; place-items:center; border-radius:50%; background:#edf6e2; color:#6bad28; }
  .oweg-auth-dots { position:absolute; left:28px; bottom:28px; width:64px; height:48px; background:radial-gradient(circle,#bddf9f 1.5px,transparent 2px) 0 0/13px 13px; }
  @media(min-width:900px) {
    .oweg-auth-page { display:flex!important; align-items:center!important; justify-content:center!important; gap:clamp(32px,5vw,90px); padding:56px clamp(32px,5vw,88px); }
    #${PANEL_ID} { display:block; flex:1 1 520px; max-width:600px; position:relative; }
    #${WRAPPER_ID} { width:auto; flex:0 1 440px; min-height:0; padding:0; }
  }
  @media(max-width:480px) {
    #${WRAPPER_ID} { padding:24px 16px; }
    .oweg-auth-card { padding:32px 23px 24px; border-radius:16px; }
    .oweg-auth-card h1 { font-size:23px!important; }
    #${LOGO_ID} img { width:180px; }
    .oweg-auth-dots { display:none; }
  }
  @media(prefers-reduced-motion:reduce) { .oweg-auth-card button { transition:none; } }
  `
}
function createBrandPanel(src: string) {
  const panel = document.createElement("aside")
  panel.id = PANEL_ID
  panel.className = "oweg-brand-panel"
  panel.setAttribute("aria-label", "OWEG admin workspace")
  panel.append(brand(src, "oweg-brand-logo"))
  const content = document.createElement("div")
  content.innerHTML = `<h2>Manage. Monitor. <span>Grow.</span></h2><p class="oweg-brand-copy">One workspace for operations, sales performance, payments and dispatch tracking.</p><div class="oweg-brand-features">${[
    [icons.users,"User<br>Management"], [icons.sales,"Sales<br>Performance"],
    [icons.card,"Payments &amp;<br>Settlements"], [icons.truck,"Dispatch<br>Monitoring"],
  ].map(([paths,label])=>`<div class="oweg-brand-feature"><span>${icon(paths)}</span><p>${label}</p></div>`).join("")}</div>`
  panel.append(content)
  return panel
}
function applyBranding() {
  if (!logoSrc || !/\/(login|reset-password)(\/|$)/.test(window.location.pathname)) return
  const root = document.querySelector<HTMLElement>(".min-h-dvh.w-dvw.items-center.justify-center")
  const card = root?.querySelector<HTMLElement>(".max-w-\\[280px\\].flex-col.items-center, .max-w-\\[300px\\].flex-col.items-center")
  if (!root || !card) return
  root.classList.add("oweg-auth-page")
  card.classList.add("oweg-auth-card")
  let wrapper = document.getElementById(WRAPPER_ID)
  if (!wrapper) {
    wrapper = document.createElement("div")
    wrapper.id = WRAPPER_ID
    root.insertBefore(wrapper,card)
    wrapper.append(card)
  }
  if (!document.getElementById(PANEL_ID)) root.insertBefore(createBrandPanel(logoSrc),wrapper)
  card.querySelector<HTMLElement>(".h-\\[50px\\].w-\\[50px\\], .size-14.bg-ui-button-neutral")?.classList.add("oweg-default-logo")
  if (!card.querySelector(`#${LOGO_ID}`)) {
    const logo = brand(logoSrc,"oweg-auth-wordmark")
    logo.id = LOGO_ID
    card.insertBefore(logo,card.firstChild)
  }
  if (!card.querySelector(".oweg-auth-security")) {
    const footer = document.createElement("p")
    footer.className = "oweg-auth-security"
    footer.innerHTML = `${icon(icons.shield)}<span>Secure access for authorized users</span>`
    card.append(footer)
  }
  if (!root.querySelector(".oweg-auth-dots")) {
    const dots = document.createElement("div")
    dots.className = "oweg-auth-dots"
    dots.setAttribute("aria-hidden","true")
    root.append(dots)
  }
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = styles()
    document.head.append(style)
  }
}
function scheduleApply() {
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(()=>{
    timer = null
    // Decorative DOM changes must not schedule an observer loop.
    observer?.disconnect()
    try { applyBranding() } finally { observer?.observe(document.body,{childList:true,subtree:true}) }
  },0)
}
export function initAuthPageBranding(src: string) {
  logoSrc = src
  if (!initialized) {
    initialized = true
    observer = new MutationObserver(scheduleApply)
    observer.observe(document.body,{childList:true,subtree:true})
    window.addEventListener("popstate",scheduleApply)
    const push = history.pushState.bind(history), replace = history.replaceState.bind(history)
    history.pushState = (...args)=>{ push(...args); scheduleApply() }
    history.replaceState = (...args)=>{ replace(...args); scheduleApply() }
  }
  scheduleApply()
}
