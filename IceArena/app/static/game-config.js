(() => {
    "use strict";

    window.ICE_ARENA_CONFIG = {
        settings: {
            gameDuration: 8 * 60 * 1000,
            trapDelay: 3800,
            freezeDuration: 1300,
            maxHealth: 3,
            baseTrapCapacity: 1,
            baseBlastRange: 1,
            itemLifetime: 10000,
            supplyInterval: 25 * 1000,
            icicleCooldown: 15 * 1000,
            icicleRange: 5,
            baseMoveDelay: 500,
            iceLootChance: 0.7,
            iceLootBuffChance: 0.65,
            initialIceBlockCount: 60,
            supplyMinItems: 2,
            supplyMaxItems: 3,
            mountSpeed: {fast: 2.0, normal: 1.5},
            mountMaxHp: 1
        },

        characters: [
            {id: "penguin", name: "펭귄", icon: "🐧", trait: "고드름 투척", description: "15초마다 바라보는 방향으로 최대 5칸까지 고드름을 던져 첫 함정을 즉시 발동합니다. P1은 G, P2는 Shift 키를 사용합니다."},
            {id: "polarBear", name: "북극곰", icon: "🐻‍❄️", trait: "함정 전문가", description: "함정 설치 한도 2개로 시작합니다.", startingTrapCapacity: 2},
            {id: "arcticFox", name: "북극여우", icon: "🦊", trait: "빠른 발", description: "기본 이동 속도가 15% 빠릅니다.", moveSpeedMultiplier: 1.15},
            {id: "mammoth", name: "매머드", icon: "🦣", trait: "강력한 폭발", description: "폭발 범위 2칸으로 시작합니다.", startingBlastRange: 2},
            {id: "owl", name: "올빼미", icon: "🦉", trait: "아이템 증폭", description: "함정 추가·폭발 범위·슈퍼맨 지속시간·이동 강화 아이템 효과가 1.5배입니다.", buffMultiplier: 1.5},
            {id: "arcticHare", name: "북극토끼", icon: "🐇", trait: "함정 밀어내기", description: "신발 아이템 없이도 처음부터 함정을 밀어낼 수 있습니다.", hasShoes: true},
            {id: "reindeer", name: "순록", icon: "🦌", trait: "강인한 정신", description: "접착제와 악마 디버프의 지속 시간이 절반으로 줄어듭니다.", debuffDurationMultiplier: 0.5},
            {id: "wolf", name: "늑대", icon: "🐺", trait: "생존 본능", description: "경기 중 함정 폭발 피해를 한 번 막아냅니다.", trapShieldCharges: 1},
            {id: "yeti", name: "예티 (설인)", icon: "🧌", trait: "설원의 지배자", description: "함정 3개와 폭발 범위 3칸으로 시작하며 기본 이동 속도가 30% 빠릅니다.", startingTrapCapacity: 3, startingBlastRange: 3, moveSpeedMultiplier: 1.3}
        ],

        mysteryCharacter: {
            id: "mystery", name: "?", icon: "❔", trait: "희귀 캐릭터 추첨",
            description: "선택하면 5% 확률로 예티가 등장하고, 그 외에는 기존 캐릭터 8종 중 하나가 무작위로 선택됩니다. 결과는 게임 시작 후 공개됩니다."
        },
        yetiChance: 0.05,

        items: {
            extraTrap: {icon: "💧", category: "buff", amount: 1, max: 4},
            blastRange: {icon: "✦", category: "buff", amount: 1, max: 3},
            rollerSkates: {icon: "🛼", category: "buff", moveDelayMultiplier: 0.75},
            shoes: {icon: "👟", category: "buff"},
            superman: {icon: "🦸", category: "buff", durationMs: 20000},
            walrusFast: {icon: "🏴‍☠️", category: "mount"},
            walrusNormal: {icon: "🦭", category: "mount"},
            banana: {icon: "🍌", category: "debuff", durationMs: 450, slipSteps: 2},
            glue: {icon: "🧴", category: "debuff", durationMs: 10000, moveDelayMultiplier: 2.2},
            devil: {icon: "😈", category: "debuff", durationMs: 10000}
        },

        itemPools: {
            buffs: ["extraTrap", "blastRange", "rollerSkates", "shoes", "superman"],
            debuffs: ["banana", "glue", "devil"],
            mounts: ["walrusFast", "walrusNormal"],
            supplyCategories: ["buffs", "debuffs", "mounts"]
        }
    };
})();
