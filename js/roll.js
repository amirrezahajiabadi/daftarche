/* ═══ Lucky Dice: What's the Next Task? ═══ */

import { state } from './state.js';
import { $ } from './utils.js';
import { flashTask } from './tasks.js';

let rollFinal = null;

function openRoll() {
  const pool = state.tasks.filter(t => !t.done);
  $('#rollOverlay').hidden = false;
  $('#rollActions').hidden = true;
  const box = $('#rollBox');
  const txt = $('#rollText');
  box.classList.remove('landed', 'tick');
  rollFinal = null;
  if (!pool.length) {
    txt.textContent = 'همه کارا انجام شده، دمت گرم!';
    box.classList.add('landed');
    return;
  }
  let i = 0, steps = 16, delay = 45;
  (function spin() {
    const pick = pool[Math.random() * pool.length | 0];
    txt.textContent = pick.text;
    box.classList.remove('tick'); void box.offsetWidth; box.classList.add('tick');
    i++;
    if (i < steps) { delay += 13; setTimeout(spin, delay); }
    else {
      rollFinal = pick;
      box.classList.add('landed');
      $('#rollActions').hidden = false;
    }
  })();
}

export function initRoll() {
  $('#diceBtn').onclick = openRoll;
  $('#rollGo').onclick = () => {
    $('#rollOverlay').hidden = true;
    if (rollFinal) flashTask(rollFinal.id);
  };
  $('#rollAgain').onclick = openRoll;
  $('#rollClose').onclick = () => { $('#rollOverlay').hidden = true; };
  $('#rollOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
}