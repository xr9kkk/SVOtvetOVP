(function (root) {
  const normalize = value => value.normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ').replace(/[−–—]/gu, '-');
  class Detector {
    constructor(config) { this.config = config; this.events = []; this.sent = new Map(); this.lastSent = -Infinity; }
    add({id, author, text}, now) {
      const key = normalize(text) || text.trim();
      const own = normalize(this.config.ownName);
      if (!author || normalize(author) === own) return;
      const answer = this.config.anyText ? text.trim() : this.config.answers.find(value => (normalize(value) || value.trim()) === key);
      if (!answer) return;
      this.events = this.events.filter(event => now - event.time <= this.config.windowMs);
      if (!this.events.some(event => event.id === id)) this.events.push({id, author: normalize(author), key, time: now});
      const count = new Set(this.events.filter(event => event.key === key).map(event => event.author)).size;
      if (count < this.config.threshold || now - this.lastSent < this.config.cooldownMs || now - (this.sent.get(key) ?? -Infinity) < this.config.cooldownMs) return;
      return {key, answer, count};
    }
    consume(candidate, now) { this.sent.set(candidate.key, now); this.lastSent = now; this.events = []; }
  }
  root.ChatDetector = {Detector, normalize};
  if (typeof module !== 'undefined') module.exports = root.ChatDetector;
})(globalThis);
