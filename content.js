(() => {
  'use strict';
  const MESSAGE = '[data-test="chatMessageContent"][data-chat-message-id]';
  const defaults = {ownName: '', answers: '+\n-\nЗдравствуйте\nДоброе утро!', threshold: 4, seconds: 30, cooldown: 120, auto: false, anyText: false};
  let running = false, detector, config, observer, timer, busy = false;
  const seen = new Set();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;top:100px;z-index:2147483647';
  const shadow = host.attachShadow({mode:'closed'});
  shadow.innerHTML = `<style>
    *{box-sizing:border-box}details{width:300px;background:#182231;color:#f4f6fa;border:1px solid #62718b;border-radius:10px;font:13px/1.4 Arial;padding:12px;box-shadow:0 4px 20px #0006}summary{cursor:pointer;font-weight:bold}label{display:block;margin:8px 0}input:not([type=checkbox]),textarea{width:100%;padding:5px;background:#fff;color:#111;border:1px solid #aaa;border-radius:4px}button{padding:7px;margin:3px;cursor:pointer}#log{white-space:pre-wrap;max-height:150px;overflow:auto;font-size:12px}small{color:#c8d4e6}
  </style><details><summary>Помощник чата · <span id="status">выключен</span></summary>
  <label>Ваше имя в чате (точно как отображается)<input id="ownName"></label>
  <label><input id="anyText" type="checkbox"> Любой повторяющийся текст</label>
  <small>В этом режиме список ниже не используется. Копируется последний совпавший ответ.</small>
  <label>Разрешённые ответы — каждый с новой строки<textarea id="answers" rows="4"></textarea></label>
  <label>Разных участников<input id="threshold" type="number" min="2" max="100"></label>
  <label>Окно подсчёта, секунд<input id="seconds" type="number" min="5" max="300"></label>
  <label>Пауза между ответами, секунд<input id="cooldown" type="number" min="30" max="3600"></label>
  <label><input id="auto" type="checkbox"> Автоматически отправлять</label>
  <small>Без галочки — только журнал. Настройки применяются при запуске. Esc останавливает помощник.</small>
  <div><button id="start">Запустить</button><button id="stop">Остановить</button></div><div id="log" aria-live="polite"></div></details>`;
  document.documentElement.append(host);
  const $ = id => shadow.getElementById(id);
  function log(text) { $('log').textContent = `${new Date().toLocaleTimeString()} ${text}\n${$('log').textContent}`.slice(0, 5000); }
  function stop() { running = false; observer?.disconnect(); clearTimeout(timer); $('status').textContent = 'выключен'; }
  function authorOf(node) {
    // BBB places the author header before the message body; consecutive messages may share a header.
    let branch = node;
    for (let depth = 0; branch && depth < 5; depth++, branch = branch.parentElement) {
      let sibling = branch.previousElementSibling;
      for (let i = 0; sibling && i < 30; i++, sibling = sibling.previousElementSibling) {
        const names = [...sibling.querySelectorAll('.bbb-chat-message__name')];
        if (sibling.matches('.bbb-chat-message__name')) names.push(sibling);
        if (names.length) return names.at(-1).textContent.trim();
        if (sibling.querySelector(MESSAGE)) break;
      }
      // Do not search across the entire message list or unrelated page content.
      if (branch.parentElement?.querySelectorAll(MESSAGE).length > 1) break;
    }
    return '';
  }
  function readConfig() {
    const result = {ownName:$('ownName').value.trim(), answers:$('answers').value.split('\n').map(s=>s.trim()).filter(Boolean), threshold:Number($('threshold').value), windowMs:Number($('seconds').value)*1000, cooldownMs:Number($('cooldown').value)*1000, auto:$('auto').checked, anyText:$('anyText').checked};
    if (!result.ownName) throw Error('Укажите своё имя, чтобы исключить собственные сообщения.');
    if (!result.anyText && (!result.answers.length || result.answers.some(s=>s.length>200))) throw Error('Укажите короткие разрешённые ответы (до 200 символов).');
    for (const id of ['threshold','seconds','cooldown']) if (!$(id).checkValidity() || !$(id).value) throw Error('Проверьте числовые настройки.');
    return result;
  }
  function send(answer) {
    const input = document.querySelector('#message-input');
    if (!input || input.disabled || input.readOnly || !input.getClientRects().length) throw Error('Поле чата недоступно.');
    if (!/Общий чат/i.test(input.getAttribute('aria-label') || input.placeholder)) throw Error('Открыт не общий чат.');
    if (input.value.trim()) throw Error('В поле уже есть текст. Отправка остановлена.');
    let scope = input.parentElement, button;
    for (let depth=0; scope && depth<4; depth++, scope=scope.parentElement) {
      const candidates = [...scope.querySelectorAll('[data-testid="SendIcon"]')].map(icon=>icon.closest('button')).filter(Boolean);
      if (candidates.length===1) { button=candidates[0]; break; }
    }
    if (!button || !button.getClientRects().length) throw Error('Кнопка отправки рядом с полем не найдена. Нужен outerHTML её элемента button.');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, answer);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    busy = true;
    timer = setTimeout(() => {
      busy = false;
      if (!running) return;
      if (!input.isConnected || !button.isConnected || button.disabled || input.value !== answer) { stop(); log('Отправка остановлена: поле или кнопка изменились.'); return; }
      button.click();
      log(`Нажата кнопка отправки: ${answer}. Доставку проверьте в чате.`);
    }, 400);
  }
  function scan() {
    if (!running || busy) return;
    for (const node of document.querySelectorAll(MESSAGE)) {
      const id = node.dataset.chatMessageId;
      if (seen.has(id)) continue;
      const text = node.querySelector('[data-test="messageContent"]')?.textContent.trim();
      if (!text) continue;
      seen.add(id);
      const author = authorOf(node);
      if (!author) { log('Пропущено сообщение: не найден автор.'); continue; }
      const candidate = detector.add({id, author, text}, Date.now());
      if (!candidate) continue;
      detector.consume(candidate, Date.now());
      log(`${candidate.count} участников: «${candidate.answer}»${config.auto ? '' : ' — тест, без отправки'}`);
      if (config.auto) {
        try { send(candidate.answer); } catch(error) { stop(); log(error.message); }
        break;
      }
    }
  }
  $('start').onclick = async () => {
    stop();
    busy = false;
    try {
      config = readConfig();
      if (!document.querySelector('#message-input')) throw Error('Сначала откройте общий чат.');
      await chrome.storage.local.set({chatHelper:{...config, answers:$('answers').value, seconds:config.windowMs/1000, cooldown:config.cooldownMs/1000, auto:false}});
      detector = new ChatDetector.Detector(config);
      seen.clear();
      document.querySelectorAll(MESSAGE).forEach(node=>seen.add(node.dataset.chatMessageId));
      running = true;
      $('status').textContent = config.auto ? 'автоотправка' : 'тест';
      observer = new MutationObserver(() => { if (!busy) { clearTimeout(timer); timer=setTimeout(scan,150); } });
      observer.observe(document.body,{subtree:true, childList:true, characterData:true});
      log('Запущено. Уже видимые сообщения исключены.');
    } catch(error) { log(error.message); }
  };
  $('stop').onclick = () => { stop(); log('Остановлено.'); };
  document.addEventListener('keydown', event => { if (event.key==='Escape') { stop(); log('Остановлено клавишей Esc.'); } }, true);
  $('anyText').onchange = () => { $('answers').disabled = $('anyText').checked; };
  chrome.storage.local.get('chatHelper').then(data => {
    const values = {...defaults, ...data.chatHelper, auto:false};
    for (const key of Object.keys(defaults)) { if ($(key).type==='checkbox') $(key).checked=Boolean(values[key]); else $(key).value=values[key]; }
    $('anyText').onchange();
  });
})();
