/**
 * Unified Input Abstraction Layer (§9.1 & §9.2)
 * Normalizes Manual Input, Paste Parser, Simulator, and future Webhook events
 * into a single DonationEvent pipeline with Undo, Unassigned Queue, and MVP tracking.
 */

export function normalizeDonation({
  eventId = null,
  source = "manual",
  donatorName = "Anonim",
  amount = 5000,
  targetCarIndex = null,
  skillId = null,
  skillKeyword = null,
  rawMessage = "",
  timestamp = Date.now(),
} = {}) {
  const cleanMsg = String(rawMessage || "").trim().slice(0, 240);

  // Extract #<number> if not explicitly set
  let resolvedTarget =
    typeof targetCarIndex === "number" && targetCarIndex >= 0 ? targetCarIndex : null;
  if (resolvedTarget === null && cleanMsg) {
    const m = cleanMsg.match(/#(\d{1,2})/);
    if (m) resolvedTarget = parseInt(m[1], 10) - 1;
  }

  // Extract !<skillKeyword> if not explicitly set
  let resolvedKeyword = skillKeyword ? String(skillKeyword).toLowerCase() : null;
  if (!resolvedKeyword && cleanMsg) {
    const kwMatch = cleanMsg.match(/!([a-z0-9_]+)/i);
    if (kwMatch) resolvedKeyword = kwMatch[1].toLowerCase();
  }

  return {
    eventId:
      eventId || `evt_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
    source,
    donatorName: String(donatorName || "Anonim").trim().slice(0, 36) || "Anonim",
    amount: Math.max(0, Number(amount) || 0),
    targetCarIndex: resolvedTarget,
    skillId: skillId && skillId !== "auto" ? skillId : null,
    skillKeyword: resolvedKeyword,
    rawMessage: cleanMsg,
    timestamp,
    executed: false,
    undone: false,
  };
}

/**
 * Parses a pasted notification string such as:
 * "Budi donasi Rp 50.000: #2 !misil sikat bang!"
 * or "Sari 25k #1 semangat"
 */
export function parsePasteNotification(rawText, participantList = []) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  // 1. Amount detection (handles Rp 50.000, 50.000, 50k, 50rb, 50000)
  let amount = 10000;
  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(k|rb|ribu)\b/i);
  const rpMatch = text.match(/(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/i);
  if (kMatch) {
    amount = Math.round(parseFloat(kMatch[1].replace(",", ".")) * 1000);
  } else if (rpMatch) {
    amount = parseInt(rpMatch[1].replace(/[.,]/g, ""), 10);
  }

  // 2. Target car #number or participant name match
  let targetCarIndex = null;
  const numMatch = text.match(/#(\d{1,2})/);
  if (numMatch) {
    targetCarIndex = parseInt(numMatch[1], 10) - 1;
  } else {
    const lower = text.toLowerCase();
    participantList.forEach((p, idx) => {
      if (p.name && lower.includes(p.name.toLowerCase())) {
        targetCarIndex = idx;
      }
    });
  }

  // 3. Skill keyword !skill
  const kwMatch = text.match(/!([a-z0-9_]+)/i);
  const skillKeyword = kwMatch ? kwMatch[1].toLowerCase() : null;

  // 4. Donator name (words before "donasi", "barusan", "Rp", or colon)
  let donatorName = "Penonton";
  const nameMatch = text.match(/^([a-zA-Z0-9_\s]{2,24}?)(?:\s+donasi|\s+mendonasikan|\s+rp|\s+\d|\s*:)/i);
  if (nameMatch) {
    donatorName = nameMatch[1].trim();
  }

  return {
    donatorName,
    amount,
    targetCarIndex,
    skillKeyword,
    rawMessage: text,
  };
}

export class DonationManager {
  constructor({ skillCatalog, onExecuteEvent, onStateChange, onCombo }) {
    this.skillCatalog = skillCatalog;
    this.onExecuteEvent = onExecuteEvent;
    this.onStateChange = onStateChange;
    this.onCombo = onCombo;

    this.seenIds = new Set();
    this.queue = [];
    this.history = [];
    this.unassigned = [];
    this.donatorTotals = new Map(); // donatorName -> { totalAmount, count, topSkill }
    this.recentWindow = []; // timestamps & amounts for 60s Hype Meter
    this.comboTracker = new Map(); // carIndex -> number[] timestamps

    this.cooldown = 0;
    this.minIntervalSec = 1.1;
  }

  resetForNewRace() {
    this.queue = [];
    this.history = [];
    this.unassigned = [];
    this.donatorTotals.clear();
    this.recentWindow = [];
    this.comboTracker.clear();
    this.cooldown = 0;
    this._notify();
  }

  submitDonation(rawInput, validKartCount = 4) {
    const evt = normalizeDonation(rawInput);
    if (this.seenIds.has(evt.eventId)) return null;
    this.seenIds.add(evt.eventId);

    const skill = this.skillCatalog.resolveSkill({
      skillId: evt.skillId,
      skillKeyword: evt.skillKeyword,
      amount: evt.amount,
    });
    evt.resolvedSkill = skill;

    // If targetCarIndex is missing or out of bounds -> route to Unassigned Queue
    if (
      evt.targetCarIndex === null ||
      evt.targetCarIndex < 0 ||
      evt.targetCarIndex >= validKartCount
    ) {
      this.unassigned.unshift(evt);
      this._notify();
      return { status: "unassigned", event: evt };
    }

    this._enqueueAssignedEvent(evt);
    return { status: "queued", event: evt };
  }

  assignUnassigned(eventId, targetCarIndex) {
    const idx = this.unassigned.findIndex((e) => e.eventId === eventId);
    if (idx === -1) return false;
    const [evt] = this.unassigned.splice(idx, 1);
    evt.targetCarIndex = targetCarIndex;
    this._enqueueAssignedEvent(evt);
    return true;
  }

  _enqueueAssignedEvent(evt) {
    // Priority insert for Legendary / Mythic skills
    const isHighPriority =
      evt.resolvedSkill.rarity === "legendary" || evt.resolvedSkill.rarity === "mythic";
    if (isHighPriority) {
      this.queue.unshift(evt);
    } else {
      this.queue.push(evt);
    }

    this.history.unshift(evt);
    if (this.history.length > 50) this.history.pop();

    // Update Donator MVP stats
    const prev = this.donatorTotals.get(evt.donatorName) || {
      name: evt.donatorName,
      totalAmount: 0,
      count: 0,
      lastSkill: evt.resolvedSkill.name,
    };
    prev.totalAmount += evt.amount;
    prev.count += 1;
    prev.lastSkill = `${evt.resolvedSkill.icon} ${evt.resolvedSkill.name}`;
    this.donatorTotals.set(evt.donatorName, prev);

    // Update 60s Hype window
    this.recentWindow.push({ time: Date.now(), amount: evt.amount });

    // Check Support Combo (3+ donations to the same kart within 10s)
    const now = Date.now();
    const list = (this.comboTracker.get(evt.targetCarIndex) || []).filter(
      (t) => now - t <= 10000
    );
    list.push(now);
    this.comboTracker.set(evt.targetCarIndex, list);
    if (list.length >= 3 && this.onCombo) {
      this.onCombo(evt.targetCarIndex, list.length);
    }

    this._notify();
  }

  undoEvent(eventId = null) {
    const target = eventId
      ? this.history.find((e) => e.eventId === eventId && !e.undone)
      : this.history.find((e) => !e.undone);

    if (!target) return null;
    target.undone = true;

    // Remove from pending queue if not yet executed
    const qIdx = this.queue.findIndex((e) => e.eventId === target.eventId);
    if (qIdx !== -1) {
      this.queue.splice(qIdx, 1);
    }

    // Subtract from donator totals
    const stat = this.donatorTotals.get(target.donatorName);
    if (stat) {
      stat.totalAmount = Math.max(0, stat.totalAmount - target.amount);
      stat.count = Math.max(0, stat.count - 1);
      if (stat.count === 0) this.donatorTotals.delete(target.donatorName);
    }

    this._notify();
    return target;
  }

  getHypeProgress(targetRpPerMin = 250000) {
    const cutoff = Date.now() - 60000;
    this.recentWindow = this.recentWindow.filter((item) => item.time >= cutoff);
    const sum = this.recentWindow.reduce((acc, item) => acc + item.amount, 0);
    return Math.min(1, sum / targetRpPerMin);
  }

  getMvpDonator() {
    let best = null;
    for (const val of this.donatorTotals.values()) {
      if (!best || val.totalAmount > best.totalAmount) {
        best = val;
      }
    }
    return best;
  }

  update(dt) {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }
    if (this.cooldown <= 0 && this.queue.length > 0) {
      const nextEvt = this.queue.shift();
      if (!nextEvt.undone) {
        nextEvt.executed = true;
        this.cooldown = this.minIntervalSec;
        if (this.onExecuteEvent) {
          this.onExecuteEvent(nextEvt);
        }
        this._notify();
      }
    }
  }

  _notify() {
    if (this.onStateChange) {
      this.onStateChange({
        history: this.history,
        unassigned: this.unassigned,
        queueLength: this.queue.length,
        mvp: this.getMvpDonator(),
      });
    }
  }
}
