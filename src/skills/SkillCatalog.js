/**
 * Complete Catalog of 13 Skills across 6 Rarity Tiers
 * Configurable minimum donation amounts and keywords.
 */

export const RARITY_META = {
  common: {
    label: "COMMON",
    color: "#e2e8f0",
    border: "#94a3b8",
    glow: "rgba(226, 232, 240, 0.45)",
    badgeBg: "linear-gradient(135deg, #475569, #1e293b)",
  },
  uncommon: {
    label: "UNCOMMON",
    color: "#4ade80",
    border: "#22c55e",
    glow: "rgba(74, 222, 128, 0.55)",
    badgeBg: "linear-gradient(135deg, #166534, #064e3b)",
  },
  rare: {
    label: "RARE",
    color: "#38bdf8",
    border: "#0284c7",
    glow: "rgba(56, 189, 248, 0.65)",
    badgeBg: "linear-gradient(135deg, #0369a1, #0c4a6e)",
  },
  epic: {
    label: "EPIC",
    color: "#c084fc",
    border: "#9333ea",
    glow: "rgba(192, 132, 252, 0.7)",
    badgeBg: "linear-gradient(135deg, #6b21a8, #3b0764)",
  },
  legendary: {
    label: "LEGENDARY",
    color: "#facc15",
    border: "#eab308",
    glow: "rgba(250, 204, 21, 0.8)",
    badgeBg: "linear-gradient(135deg, #a16207, #422006)",
  },
  mythic: {
    label: "MYTHIC",
    color: "#fb7185",
    border: "#e11d48",
    glow: "rgba(251, 113, 133, 0.9)",
    badgeBg: "linear-gradient(135deg, #9f1239, #4c0519)",
  },
};

export const DEFAULT_SKILLS = [
  {
    id: "mini_boost",
    name: "Mini Boost",
    icon: "💨",
    rarity: "common",
    type: "Buff",
    minAmount: 5000,
    maxAmount: 9999,
    keywords: ["boost", "gas", "miniboost"],
    duration: 2.2,
    speedBonus: 0.38,
    description: "Kecepatan +38% selama 2.2 detik dengan semburan api biru.",
  },
  {
    id: "banana_trap",
    name: "Banana Trap",
    icon: "🍌",
    rarity: "common",
    type: "Trap",
    minAmount: 10000,
    maxAmount: 14999,
    keywords: ["banana", "pisang", "trap"],
    duration: 1.5,
    description: "Jatuhkan pisang di belakang mobil. Lawan yang menginjak spin-out 1.5 detik!",
  },
  {
    id: "oil_slick",
    name: "Oil Slick",
    icon: "🛢️",
    rarity: "uncommon",
    type: "Trap",
    minAmount: 15000,
    maxAmount: 24999,
    keywords: ["oil", "oli", "licin"],
    duration: 2.2,
    description: "Tumpahkan genangan oli hitam. Lawan yang melintas oleng zig-zag & melambat 45%!",
  },
  {
    id: "guardian_shield",
    name: "Guardian Shield",
    icon: "🛡️",
    rarity: "uncommon",
    type: "Defense",
    minAmount: 15000,
    maxAmount: 24999,
    keywords: ["shield", "tameng", "pelindung", "kebal"],
    duration: 6.5,
    preferKeyword: true,
    description: "Gelembung heksagonal pelindung 6.5 detik. Kebal CC & memantulkan misil balik ke penyerang!",
  },
  {
    id: "nitro_nos",
    name: "Nitro NOS",
    icon: "🚀",
    rarity: "rare",
    type: "Buff",
    minAmount: 25000,
    maxAmount: 49999,
    keywords: ["nitro", "nos", "turbo"],
    duration: 3.6,
    speedBonus: 0.85,
    description: "Kecepatan +85% selama 3.6 detik, api plasma ungu-biru & kamera wide FOV!",
  },
  {
    id: "homing_missile",
    name: "Homing Missile",
    icon: "🎯",
    rarity: "rare",
    type: "Attack",
    minAmount: 50000,
    maxAmount: 74999,
    keywords: ["misil", "missile", "roket", "rocket"],
    duration: 2.5,
    description: "Rudal pencari panas mengincar mobil 1 peringkat di depan! Target terpental & stun 2.5 detik.",
  },
  {
    id: "freeze_ray",
    name: "Freeze Ray",
    icon: "🥶",
    rarity: "rare",
    type: "Attack",
    minAmount: 50000,
    maxAmount: 74999,
    keywords: ["freeze", "es", "beku", "ice"],
    duration: 2.2,
    preferKeyword: true,
    description: "Sinar pembeku! Membungkus lawan di depan dalam kristal es selama 2.2 detik & menghapus buff.",
  },
  {
    id: "magnet_beam",
    name: "Magnet Beam",
    icon: "🧲",
    rarity: "epic",
    type: "Utility",
    minAmount: 75000,
    maxAmount: 99999,
    keywords: ["magnet", "tarik", "tractor"],
    duration: 2.4,
    description: "Sinar traktor magnetik menarik mobil pilihan mendekat ke mobil di depannya!",
  },
  {
    id: "giant_mode",
    name: "Giant Mode",
    icon: "🦖",
    rarity: "epic",
    type: "Buff",
    minAmount: 75000,
    maxAmount: 99999,
    keywords: ["giant", "raksasa", "besar", "titan"],
    duration: 5.5,
    speedBonus: 0.55,
    preferKeyword: true,
    description: " Ukuran mobil membesar 2.2x selama 5.5 detik! Kebal jebakan & menyeruduk lawan di dekatnya!",
  },
  {
    id: "thunder_strike",
    name: "Thunder Strike",
    icon: "⚡",
    rarity: "legendary",
    type: "Ultimate",
    minAmount: 100000,
    maxAmount: 149999,
    keywords: ["thunder", "petir", "kilat", "lightning"],
    duration: 4.2,
    description: "Langit menggelap & petir menyambar SEMUA lawan! Ukuran & kecepatan lawan menyusut 50%.",
  },
  {
    id: "sultan_strike",
    name: "Sultan Strike",
    icon: "👑",
    rarity: "legendary",
    type: "Ultimate",
    minAmount: 150000,
    maxAmount: 199999,
    keywords: ["sultan", "blueshell", "nuke", "leader"],
    duration: 3.0,
    description: "Rudal orbital khusus mengincar PERINGKAT #1! Terbang tinggi lalu menukik dengan ledakan besar.",
  },
  {
    id: "position_swap",
    name: "Position Swap",
    icon: "🌀",
    rarity: "mythic",
    type: "Ultimate",
    minAmount: 200000,
    maxAmount: 499999,
    keywords: ["swap", "tukar", "teleport", "portal"],
    duration: 1.8,
    description: "Membuka portal dimensi untuk BERTUKAR POSISI langsung dengan mobil di depannya!",
  },
  {
    id: "meteor_shower",
    name: "Meteor Shower",
    icon: "☄️",
    rarity: "mythic",
    type: "Ultimate",
    minAmount: 500000,
    maxAmount: 999999999,
    keywords: ["meteor", "kiamat", "armageddon", "hujan"],
    duration: 5.0,
    description: "Hujan meteor menghantam lintasan selama 5 detik! Semua kompetitor berisiko terkena ledakan meteor.",
  },
];

const TIER_STORAGE_KEY = "streamkart_skill_tiers_v1";

export class SkillCatalog {
  constructor() {
    this.skills = structuredClone(DEFAULT_SKILLS);
    this.loadCustomTiers();
  }

  loadCustomTiers() {
    try {
      const saved = localStorage.getItem(TIER_STORAGE_KEY);
      if (!saved) return;
      const map = JSON.parse(saved);
      for (const skill of this.skills) {
        if (typeof map[skill.id] === "number" && map[skill.id] >= 0) {
          skill.minAmount = map[skill.id];
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  saveCustomTiers(tierMap) {
    for (const skill of this.skills) {
      if (typeof tierMap[skill.id] === "number" && tierMap[skill.id] >= 1000) {
        skill.minAmount = tierMap[skill.id];
      }
    }
    try {
      localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(tierMap));
    } catch {
      // ignore
    }
  }

  resetTiers() {
    this.skills = structuredClone(DEFAULT_SKILLS);
    try {
      localStorage.removeItem(TIER_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  getById(id) {
    return this.skills.find((s) => s.id === id) || this.skills[0];
  }

  /**
   * Resolves skill based on explicit skillId, `!keyword`, or donation amount tier.
   */
  resolveSkill({ skillId = null, skillKeyword = null, amount = 5000 } = {}) {
    if (skillId && skillId !== "auto") {
      const exact = this.skills.find((s) => s.id === skillId);
      if (exact) return exact;
    }

    if (skillKeyword) {
      const kw = skillKeyword.toLowerCase().trim();
      const byKeyword = this.skills.find(
        (s) => s.id === kw || s.keywords.some((k) => kw.includes(k))
      );
      if (byKeyword) return byKeyword;
    }

    const numAmount = Number(amount) || 0;
    // Sort non-keyword-preferred skills by minAmount descending so highest matching tier wins
    const primaryCandidates = this.skills
      .filter((s) => !s.preferKeyword && numAmount >= s.minAmount)
      .sort((a, b) => b.minAmount - a.minAmount);

    if (primaryCandidates.length > 0) {
      return primaryCandidates[0];
    }

    return this.skills[0]; // Mini Boost fallback
  }
}
