// Flow Tile settings (LOU-293). One list of switches, used by the Settings page (/settings/) and by the Settings sheet in a
// level's menu. Each switch is saved on this device as soon as it changes, and tells the page with a "flowtile-setting" event.
//   FlowSettings.render(element, {root, onReset})   root: the site's root URL (for the version); onReset: called after a reset
(function () {
  const get = k => { try { return localStorage.getItem(k) } catch (_) { return null } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch (_) {} };
  const deviceReduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches } catch (_) { return false } };
  const I = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  // [storage key, value when on (null: the key is removed), value when off, on by default, title, note, icon]
  const ROWS = [
    ["flowtile.sound", null, "0", true, "Sound", "Quiet water sounds", I('<path d="M4 10v4h3l4 3.500v-11L7 10z"/><path d="M15 9.500a3.500 3.500 0 010 5M17.500 7a7 7 0 010 10"/>')],
    ["flowtile.haptics", null, "0", true, "Haptics", "A small tick on moves, where your phone supports it", I('<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 9v6M20 9v6"/>')],
    ["flowtile.motion", "reduce", null, false, "Reduced motion", "Less movement on screen", I('<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 16c3-3 6 3 9 0s6 3 9 0"/>')],
    ["flowtile.guidance", null, "off", true, "Guidance", "Short guided steps when a level shows something new", I('<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/>')],
    ["flowtile.hard", "1", "0", false, "Hard mode", "3 undos per level", I('<path d="M12 3l2.600 5.600 6 .700-4.500 4.100 1.300 6L12 16.400 6.600 19.400l1.300-6L3.400 9.300l6-.700z"/>')],
  ];
  const KEEP = new Set(ROWS.map(r => r[0]).concat(["flowtile.campaign"])); // what Reset progress leaves alone: the settings themselves
  const isOn = r => { const v = get(r[0]); return v === null ? r[3] : r[1] === null ? v !== r[2] : v === r[1] };
  const CSS = `.fs{font-family:'M PLUS Rounded 1c',Nunito,system-ui,sans-serif;color:#24434a;text-align:left}
.fs-row{display:flex;align-items:center;gap:14px;padding:11px 0;border-top:1px solid rgba(36,67,74,.08);cursor:pointer}
.fs-row:first-child{border-top:0}
.fs-ico{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#eef5f6}
.fs-ico svg{width:20px;height:20px;fill:none;stroke:#24434a;stroke-width:2.200;stroke-linecap:round;stroke-linejoin:round}
.fs-row>span{flex:1;min-width:0}
.fs-row b{display:block;font-size:16px;font-weight:800;line-height:1.2}
.fs-row small{display:block;font-size:12.500px;font-weight:500;color:#4f6f70;line-height:1.3}
.fs-row input{position:absolute;opacity:0;width:1px;height:1px}
.fs-sw{flex:none;position:relative;width:50px;height:30px;border-radius:999px;background:#c3d2d4;transition:background .15s}
.fs-sw::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(30,60,60,.3);transition:transform .15s}
.fs-row input:checked+.fs-sw{background:#3f9a86}.fs-row input:checked+.fs-sw::after{transform:translateX(20px)}
.fs-row input:disabled+.fs-sw{opacity:.55}
.fs-row input:focus-visible+.fs-sw{outline:3px solid #2f7fb8;outline-offset:2px}
.fs-reset{cursor:default}.fs-reset .fs-ico svg{stroke:#b5562f}.fs-reset b{color:#b5562f}
.fs-btns{display:flex;gap:8px;margin-top:8px}
.fs button{border:0;border-radius:999px;padding:9px 16px;font:800 14px 'M PLUS Rounded 1c',Nunito,system-ui,sans-serif;cursor:pointer;background:#eef5f6;color:#24434a;box-shadow:none}
.fs button.fs-go{background:#b5562f;color:#fff}
.fs-about{margin:12px 0 2px;padding-top:12px;border-top:1px solid rgba(36,67,74,.08);font-size:12.500px;line-height:1.45;color:#4f6f70}
.fs-about b{font-weight:800;color:#24434a}
@media (prefers-reduced-motion:reduce){.fs-sw,.fs-sw::after{transition:none}}`;
  function render(el, opt = {}) { if (!el) return;
    if (!document.getElementById("fs-css")) { const st = document.createElement("style"); st.id = "fs-css"; st.textContent = CSS; document.head.appendChild(st) }
    const dev = deviceReduce();
    el.className = (el.className + " fs").trim();
    el.innerHTML = ROWS.map((r, i) => { const motion = r[0] === "flowtile.motion", locked = motion && dev; // reduced motion follows the device; here it can only be forced on
        return `<label class="fs-row"><i class="fs-ico">${r[6]}</i><span><b>${r[4]}</b><small>${locked ? "On: your device asks for less motion" : r[5]}</small></span><input type="checkbox" data-i="${i}"${locked || isOn(r) ? " checked" : ""}${locked ? " disabled" : ""}><i class="fs-sw" aria-hidden="true"></i></label>` }).join("")
      + `<div class="fs-row fs-reset" id="fsReset"><i class="fs-ico">${I('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>')}</i><span><b>Reset progress</b><small id="fsAsk">Clears your stars and saved runs. Settings stay.</small><div class="fs-btns" id="fsBtns"><button type="button" data-r="1">Reset…</button></div></span></div>`
      + `<p class="fs-about"><b>Flow Tile</b> <span id="fsVer"></span><br>A spin-off of Flow. The typeface is M PLUS Rounded 1c by the M+ Fonts Project, under the SIL Open Font License.</p>`;
    el.onchange = e => { const r = ROWS[+e.target.dataset.i]; if (!r) return; set(r[0], e.target.checked ? r[1] : r[2]);
      document.dispatchEvent(new CustomEvent("flowtile-setting", {detail:{key:r[0], on:e.target.checked}})) };
    // Reset progress asks twice, then clears the stars, bests and saved runs
    const ask = el.querySelector("#fsAsk"), btns = el.querySelector("#fsBtns"), step = n => {
      if (n === 0) { ask.textContent = "Clears your stars and saved runs. Settings stay."; btns.innerHTML = '<button type="button" data-r="1">Reset…</button>' }
      else if (n === 1) { ask.textContent = "Clear every star and saved run on this device?"; btns.innerHTML = '<button type="button" data-r="0">Cancel</button><button type="button" class="fs-go" data-r="2">Reset</button>' }
      else if (n === 2) { ask.textContent = "This can't be undone. Really reset?"; btns.innerHTML = '<button type="button" data-r="0">Cancel</button><button type="button" class="fs-go" data-r="3">Yes, reset</button>' }
      else { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^flowtile\./.test(k || "") && !KEEP.has(k)) localStorage.removeItem(k) } } catch (_) {}
        ask.textContent = "Progress cleared."; btns.innerHTML = ""; document.dispatchEvent(new CustomEvent("flowtile-setting", {detail:{key:"reset", on:true}})); if (opt.onReset) opt.onReset() } };
    el.querySelector("#fsReset").onclick = e => { const b = e.target.closest("[data-r]"); if (b) step(+b.dataset.r) };
    // the version comes from the service worker file, so there is one place to bump it
    fetch((opt.root || "") + "sw.js").then(r => r.text()).then(t => { const m = /VERSION = "([^"]+)"/.exec(t), v = el.querySelector("#fsVer"); if (m && v) v.textContent = "· version " + m[1].replace(/^v/, "") }).catch(() => {});
  }
  window.FlowSettings = {render};
})();
